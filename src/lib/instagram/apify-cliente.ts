import "server-only";

import { ApifyClient } from "apify-client";
import { usuarioInstagram } from "./usuario";

export const TIMEOUT_ACTOR_SECS = 120;
const campos = [
  "id", "shortCode", "type", "caption", "hashtags", "url", "timestamp",
  "displayUrl", "ownerUsername", "likesCount", "commentsCount", "videoPlayCount",
];

export function crearClienteApify(token: string, timeoutSecs: number) {
  return new ApifyClient({ token, timeoutSecs, maxRetries: 0 });
}

export function iniciarInstagram(cliente: ApifyClient, username: string, limite: number, maxTotalChargeUsd?: number) {
  const usuario = usuarioInstagram.parse(username);
  return cliente.actor("apify/instagram-scraper").start({
    directUrls: [`https://www.instagram.com/${usuario}/`], resultsType: "posts", resultsLimit: limite,
  }, { timeout: TIMEOUT_ACTOR_SECS, ...(maxTotalChargeUsd === undefined ? {} : {
    maxTotalChargeUsd, maxItems: limite, restartOnError: false,
  }) });
}

export async function leerDatasetInstagram(cliente: ApifyClient, datasetId: string, limite: number) {
  const { items } = await cliente.dataset(datasetId).listItems({ fields: campos, limit: limite });
  return items;
}
