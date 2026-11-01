import { skyFilesBaseUrl } from "../../lib/sky-files-url";
import { starDetails, type StarDetails } from "../../lib/sky-api";
import { paths, type ConstellationFile, type SkyIndex } from "../../sky/public-files";

// What the postcard needs: the star's card data (from the database, public function) and its
// constellation (from the public files on the CDN, never the whole sky).

const indexes = new Map<string, SkyIndex>();
/** Constellation files are immutable per version: keep the most recent ones in memory. */
const files = new Map<string, ConstellationFile>();
const MAX_FILES = 60;

export interface PostalData {
  details: StarDetails;
  file: ConstellationFile;
}

export class PostalNotFound extends Error {}

export async function loadPostalData(username: string): Promise<PostalData> {
  const base = skyFilesBaseUrl();
  const [details, index] = await Promise.all([starDetails(username), currentIndex(base)]);
  if (!details) throw new PostalNotFound(username);
  const entry = index.constellations.find((c) => c[0] === details.constellation);
  if (!entry) throw new Error(`Constellation ${details.constellation} is not published yet`);
  const url = `${base}/${paths.constellation(entry[0], entry[6])}`;
  let file = files.get(url);
  if (!file) {
    file = await getJson<ConstellationFile>(url);
    if (files.size >= MAX_FILES) files.delete(files.keys().next().value!);
    files.set(url, file);
  }
  return { details, file };
}

/** The index latest.json points to; each version is immutable, so it is kept in memory. */
async function currentIndex(base: string): Promise<SkyIndex> {
  const latest = await getJson<{ index: string }>(`${base}/${paths.latest}`);
  let index = indexes.get(latest.index);
  if (!index) {
    index = await getJson<SkyIndex>(`${base}/${latest.index}`);
    indexes.clear(); // only the current version is useful
    indexes.set(latest.index, index);
  }
  return index;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return (await response.json()) as T;
}
