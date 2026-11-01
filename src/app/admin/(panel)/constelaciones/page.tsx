import { Suspense } from "react";
import { toRoman } from "@/map/style";
import { recentConstellations } from "@/server/admin/queries";
import { requireAdmin } from "@/server/admin/session";
import { renameConstellation } from "../../actions";
import ActionForm from "../ActionForm";
import styles from "../../admin.module.css";

export default function ConstellationsPage({ searchParams }: PageProps<"/admin/constelaciones">) {
  return (
    <Suspense fallback={<p className={styles.loading}>Cargando las constelaciones</p>}>
      <ConstellationsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ConstellationsContent({
  searchParams,
}: Pick<PageProps<"/admin/constelaciones">, "searchParams">) {
  await requireAdmin();
  const params = await searchParams;
  const around = Number(params.n);
  const list = await recentConstellations(
    40,
    Number.isInteger(around) && around > 0 ? around : undefined,
  );

  return (
    <>
      <div className={styles.pageTitle}>
        <h1>Constelaciones</h1>
        <form className={styles.dayNav} action="/admin/constelaciones">
          <label>
            Buscar número{" "}
            <input
              name="n"
              type="number"
              min={1}
              defaultValue={params.n ? String(params.n) : ""}
              style={{ width: 90 }}
            />
          </label>
        </form>
      </div>

      <section className={styles.card}>
        <p className={styles.muted}>
          Aquí puedes poner el nombre que eligió la comunidad. El nombre de una constelación en
          formación no se muestra en la página hasta que se completa. Publica para que se vean los
          cambios.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Número</th>
                <th>Nombre</th>
                <th>Estado</th>
                <th>Imagen</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td className={styles.mono}>
                    {toRoman(c.id)} <small className={styles.muted}>({c.id})</small>
                  </td>
                  <td>
                    <ActionForm action={renameConstellation} submit="Guardar" variant="inline">
                      <input type="hidden" name="id" value={c.id} />
                      <input
                        name="name"
                        defaultValue={c.name ?? ""}
                        aria-label={`Nombre de la constelación ${c.id}`}
                      />
                    </ActionForm>
                  </td>
                  <td>
                    {c.status === "complete" ? (
                      <span className={styles.tag}>Completa · día {c.completed_day}</span>
                    ) : (
                      <span className={`${styles.tag} ${styles.tagGold}`}>
                        En formación · {c.star_count} de 300
                      </span>
                    )}
                  </td>
                  <td>
                    <a
                      className={styles.link}
                      href={`/api/admin/constellation-image/${c.id}`}
                      download
                    >
                      Descargar
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
