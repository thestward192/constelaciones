"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { parseCommentList } from "@/server/admin/comment-list";
import { drawShootingStars, DrawError } from "@/server/admin/draw";
import { runJob } from "@/server/admin/jobs";
import { createSessionClient, requireAdmin } from "@/server/admin/session";
import { ImportError, importComments } from "@/server/import";
import { InstagramApi, InstagramError } from "@/server/instagram/client";
import { connectInstagram } from "@/server/instagram/hourly";
import { importDayFromInstagram } from "@/server/instagram/import";
import { recordTokenError, saveToken } from "@/server/instagram/token";
import { processInbox, supabaseStore } from "@/server/processing";
import { publishSky } from "@/server/publish/publish";
import { supabaseStorage } from "@/server/storage";
import { getAdminClient } from "@/server/supabase/admin";

export interface ActionState {
  ok: boolean | null;
  message: string;
}

const CHALLENGE_TYPES = ["cantidad", "velocidad", "regreso", "invitacion", "racha", "record"];

const done = (message: string): ActionState => {
  refresh();
  return { ok: true, message };
};
const fail = (message: string): ActionState => ({ ok: false, message });

/** A datetime-local value, which the form labels as UTC. */
function utcInput(value: string): string {
  return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`).toISOString();
}

function intField(form: FormData, name: string): number | null {
  const value = Number(String(form.get(name) ?? "").trim());
  return Number.isInteger(value) ? value : null;
}

/** Runs an admin action: checks access, turns unexpected errors into a readable message. */
async function guarded(work: () => Promise<ActionState>): Promise<ActionState> {
  await requireAdmin();
  try {
    return await work();
  } catch (error) {
    if (
      error instanceof ImportError ||
      error instanceof DrawError ||
      error instanceof InstagramError
    )
      return fail(error.message);
    console.error(error);
    return fail(
      "Algo salió mal. Inténtalo de nuevo; si se repite, revisa la conexión con Supabase.",
    );
  }
}

// ---------------------------------------------------------------- days

export async function createDay(_: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const day = intField(form, "day");
    if (!day || day < 1) return fail("El número de día debe ser 1 o más.");
    const publishedAt = String(form.get("published_at") ?? "").trim();
    const video = String(form.get("ig_media_id") ?? "").trim();
    const { error } = await getAdminClient()
      .from("days")
      .insert({
        day,
        published_at: publishedAt ? utcInput(publishedAt) : new Date().toISOString(),
        ig_media_id: video || null,
      });
    if (error?.code === "23505") {
      return fail(
        error.message.includes("ig_media_id")
          ? "Ese video ya está asociado a otro día."
          : `El día ${day} ya existe.`,
      );
    }
    if (error) return fail(error.message);
    return done(`Día ${day} creado.`);
  });
}

export async function updateDay(_: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const day = intField(form, "day");
    if (!day) return fail("Falta el día.");
    const publishedAt = String(form.get("published_at") ?? "").trim();
    const video = String(form.get("ig_media_id") ?? "").trim();
    const { error } = await getAdminClient()
      .from("days")
      .update({
        published_at: publishedAt ? utcInput(publishedAt) : null,
        ig_media_id: video || null,
      })
      .eq("day", day);
    if (error)
      return fail(
        error.code === "23505" ? "Ese video ya está asociado a otro día." : error.message,
      );
    return done(`Día ${day} actualizado.`);
  });
}

const UNLOCK_NAMES: Record<string, string> = {
  aurora: "una aurora boreal",
  cometa: "un cometa",
  luna: "la luna llena",
  borde_dorado: "el borde dorado",
  lluvia: "una lluvia de estrellas",
  nebulosa: "una nebulosa",
};

export async function setDayClosed(_: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const day = intField(form, "day");
    const closed = form.get("closed") === "true";
    if (!day) return fail("Falta el día.");
    const db = getAdminClient();
    if (!closed) {
      const { error } = await db.from("days").update({ closed: false }).eq("day", day);
      if (error) return fail(error.message);
      return done(`Día ${day} abierto de nuevo.`);
    }
    const { data, error } = await db.rpc("close_day", { p_day: day });
    if (error) return fail(error.message);
    const result = data as {
      challenge: boolean;
      met?: boolean;
      unlock?: string | null;
      progress?: number;
      goal?: number;
      goldBorders?: number;
    };
    if (!result.challenge) return done(`Día ${day} cerrado. No tenía reto.`);
    if (!result.met) {
      return done(
        `Día ${day} cerrado. El reto llegó a ${result.progress} de ${result.goal}: esta vez no se cumplió.`,
      );
    }
    const gold = result.goldBorders
      ? ` ${result.goldBorders} ${result.goldBorders === 1 ? "estrella recibió" : "estrellas recibieron"} el borde dorado.`
      : "";
    return done(
      `Día ${day} cerrado. Reto cumplido: se desbloqueó ${UNLOCK_NAMES[result.unlock ?? ""] ?? "algo nuevo"}.${gold} Publica para que aparezca en el cielo.`,
    );
  });
}

// ---------------------------------------------------------------- comments, processing, publishing

export async function importList(_: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const day = intField(form, "day");
    if (!day) return fail("Falta el día.");
    const file = form.get("file");
    const pasted = String(form.get("list") ?? "");
    const text = file instanceof File && file.size > 0 ? await file.text() : pasted;
    const comments = parseCommentList(text);
    if (!comments.length) return fail("Pega una lista o sube un archivo con al menos un usuario.");
    const db = getAdminClient();
    const summary = await runJob(db, "import", () => importComments(db, day, comments));
    const skipped = summary.invalid.length
      ? ` ${summary.invalid.length} ${summary.invalid.length === 1 ? "nombre no válido se omitió" : "nombres no válidos se omitieron"}.`
      : "";
    return done(
      `Recibidos ${summary.received}, nuevos ${summary.stored} (los repetidos no se guardan dos veces).${skipped}`,
    );
  });
}

export async function processNow(): Promise<ActionState> {
  return guarded(async () => {
    const db = getAdminClient();
    const summary = await runJob(db, "process", () => processInbox(supabaseStore(db)));
    if (summary.busy) return fail("Ya hay un procesamiento en curso. Inténtalo en un minuto.");
    return done(
      `Procesados ${summary.processed} comentarios: ${summary.newStars} estrellas nuevas, ${summary.invitesResolved} invitaciones, ${summary.constellationsCompleted} constelaciones completas.`,
    );
  });
}

export async function publishNow(): Promise<ActionState> {
  return guarded(async () => {
    const db = getAdminClient();
    const summary = await runJob(db, "publish", () => publishSky(db, supabaseStorage(db)));
    if (summary.busy) return fail("Ya hay una publicación en curso. Inténtalo en un minuto.");
    if (summary.unchanged) return done("No había cambios: la página ya estaba al día.");
    return done(
      `Publicado: ${summary.constellationFiles} constelaciones actualizadas, índice v${summary.indexVersion}.`,
    );
  });
}

// ---------------------------------------------------------------- instagram

export async function saveInstagramToken(_: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const token = String(form.get("token") ?? "").trim();
    if (token.length < 20 || /\s/.test(token)) return fail("Pega el token completo, sin espacios.");
    // Check it before replacing the current one.
    const account = await new InstagramApi(token).me();
    await saveToken(getAdminClient(), token, {
      user_id: account.user_id,
      username: account.username,
    });
    return done(`Conectado con @${account.username}.`);
  });
}

export async function assignVideo(_: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const day = intField(form, "day");
    const mediaId = String(form.get("media_id") ?? "");
    const timestamp = String(form.get("timestamp") ?? "");
    if (!day || day < 1) return fail("El número de día debe ser 1 o más.");
    if (!/^\d+$/.test(mediaId)) return fail("Video no válido.");
    const db = getAdminClient();
    const { data: existing } = await db
      .from("days")
      .select("published_at")
      .eq("day", day)
      .maybeSingle();
    const publishedAt = existing?.published_at ?? (timestamp ? utcInput(timestamp) : null);
    const { error } = await db
      .from("days")
      .upsert({ day, ig_media_id: mediaId, published_at: publishedAt ?? new Date().toISOString() });
    if (error?.code === "23505") return fail("Ese video ya está asociado a otro día.");
    if (error) return fail(error.message);
    return done(existing ? `Video asociado al día ${day}.` : `Día ${day} creado con este video.`);
  });
}

export async function importFromInstagram(_: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const day = intField(form, "day");
    if (!day) return fail("Falta el día.");
    const db = getAdminClient();
    const connection = await connectInstagram(db);
    if (!connection)
      return fail("Instagram no está conectado. Pega el token en la página Instagram.");
    try {
      const summary = await runJob(db, "import", () =>
        importDayFromInstagram(db, connection.api, day, connection.token.username),
      );
      return done(
        `Leídos ${summary.received} comentarios de Instagram, nuevos ${summary.stored}. Procesa para convertirlos en estrellas.`,
      );
    } catch (error) {
      if (error instanceof InstagramError && error.tokenInvalid)
        await recordTokenError(db, error.message);
      throw error;
    }
  });
}

// ---------------------------------------------------------------- challenge and shooting stars

export async function setChallenge(_: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const day = intField(form, "day");
    const type = String(form.get("type") ?? "");
    const level = intField(form, "level") ?? 2;
    if (!day) return fail("Falta el día.");
    if (!CHALLENGE_TYPES.includes(type)) return fail("Elige un tipo de reto.");
    // A record's goal is always the best earlier day plus one; it is computed, not typed.
    const goal = type === "record" ? 1 : intField(form, "goal");
    if (!goal || goal < 1) return fail("La meta debe ser un número mayor que 0.");
    if (level < 1 || level > 6) return fail("Elige un nivel de estrella.");
    const db = getAdminClient();
    const { error } = await db
      .from("days")
      .update({ challenge_type: type, challenge_goal: goal, challenge_level: level })
      .eq("day", day);
    if (error) return fail(error.message);
    const { error: refreshError } = await db.rpc("refresh_challenge", { p_day: day });
    if (refreshError) return fail(refreshError.message);
    return done("Reto guardado. Publica para que aparezca en la página.");
  });
}

export async function drawShooting(_: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const day = intField(form, "day");
    const count = intField(form, "count");
    if (!day || !count) return fail("Indica el día y cuántas estrellas fugaces.");
    const db = getAdminClient();
    const result = await runJob(db, "draw", () => drawShootingStars(db, day, count));
    return done(
      `Sorteo hecho: ${result.winners} estrellas fugaces entre ${result.candidates} participantes. Publica para que crucen el cielo.`,
    );
  });
}

// ---------------------------------------------------------------- moderation and names

export async function setStarStatus(_: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const id = intField(form, "id");
    const status = String(form.get("status") ?? "");
    if (!id || !["active", "hidden"].includes(status)) return fail("Acción no válida.");
    const { error } = await getAdminClient().rpc("set_star_status", {
      p_star_id: id,
      p_status: status,
    });
    if (error) return fail(error.message);
    return done(status === "active" ? "Nombre aprobado." : "Nombre ocultado.");
  });
}

export async function addBlockedWord(_: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const word = String(form.get("word") ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
    if (!/^[a-z0-9._]{2,30}$/.test(word))
      return fail("Escribe una palabra de 2 a 30 letras o números, sin espacios.");
    const { error } = await getAdminClient()
      .from("blocked_words")
      .upsert({ word }, { ignoreDuplicates: true });
    if (error) return fail(error.message);
    return done(`"${word}" agregada. Se aplica a los nombres nuevos.`);
  });
}

export async function removeBlockedWord(_: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const word = String(form.get("word") ?? "");
    const { error } = await getAdminClient().from("blocked_words").delete().eq("word", word);
    if (error) return fail(error.message);
    return done(`"${word}" quitada.`);
  });
}

export async function renameConstellation(_: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const id = intField(form, "id");
    const name = String(form.get("name") ?? "").trim();
    if (!id) return fail("Falta la constelación.");
    if (!name || name.length > 60) return fail("El nombre debe tener entre 1 y 60 caracteres.");
    const { error } = await getAdminClient().rpc("rename_constellation", {
      p_id: id,
      p_name: name,
    });
    if (error) return fail(error.message);
    return done("Nombre guardado. Publica para que se vea en la página.");
  });
}

// ---------------------------------------------------------------- session

export async function signOut() {
  const supabase = await createSessionClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
