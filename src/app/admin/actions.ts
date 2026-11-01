"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { parseCommentList } from "@/server/admin/comment-list";
import { drawShootingStars, DrawError } from "@/server/admin/draw";
import { runJob } from "@/server/admin/jobs";
import { createSessionClient, requireAdmin } from "@/server/admin/session";
import { ImportError, importComments } from "@/server/import";
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
  return new Date(/[zZ]|[+-]dd:dd$/.test(value) ? value : `${value}Z`).toISOString();
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
    if (error instanceof ImportError || error instanceof DrawError) return fail(error.message);
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

export async function setDayClosed(_: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const day = intField(form, "day");
    const closed = form.get("closed") === "true";
    if (!day) return fail("Falta el día.");
    const { error } = await getAdminClient().from("days").update({ closed }).eq("day", day);
    if (error) return fail(error.message);
    return done(closed ? `Día ${day} cerrado.` : `Día ${day} abierto de nuevo.`);
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

// ---------------------------------------------------------------- challenge and shooting stars

export async function setChallenge(_: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const day = intField(form, "day");
    const type = String(form.get("type") ?? "");
    const goal = intField(form, "goal");
    if (!day) return fail("Falta el día.");
    if (!CHALLENGE_TYPES.includes(type)) return fail("Elige un tipo de reto.");
    if (!goal || goal < 1) return fail("La meta debe ser un número mayor que 0.");
    const { error } = await getAdminClient()
      .from("days")
      .update({ challenge_type: type, challenge_goal: goal })
      .eq("day", day);
    if (error) return fail(error.message);
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
