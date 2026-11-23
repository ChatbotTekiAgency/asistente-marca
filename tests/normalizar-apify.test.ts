import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizarApify } from "../src/lib/instagram/normalizar-apify.ts";

const base = {
  id: "101",
  shortCode: "Post_1",
  type: "Image",
  url: "https://www.instagram.com/p/Post_1/?origen=prueba",
  timestamp: "2026-02-17T12:00:00.000-05:00",
  ownerUsername: "marca_prueba",
};

test("mapea el tipo, fecha y campos permitidos e ignora hijos y comentarios", () => {
  const { publicaciones, rechazados } = normalizarApify([{
    ...base, type: "Sidecar", caption: "Un carrusel", hashtags: ["ejemplo"],
    displayUrl: "https://images.example.test/foto.jpg",
    childPosts: [base], firstComment: "privado", latestComments: [{ ownerUsername: "otra" }],
    likesCount: 0, commentsCount: 5,
  }], "MARCA_PRUEBA");
  assert.deepEqual(rechazados, []);
  assert.deepEqual(publicaciones, [{
    post: {
      instagramId: "101", shortcode: "Post_1", tipo: "carrusel", caption: "Un carrusel",
      hashtags: ["ejemplo"], url: "https://www.instagram.com/p/Post_1/",
      publicadaEn: new Date("2026-02-17T17:00:00.000Z"),
      imagenOrigenUrl: "https://images.example.test/foto.jpg",
    },
    metricas: { likes: 0, comentarios: 5, reproducciones: null },
  }]);
});

test("normaliza métricas inválidas y ausentes sin perder la publicación", () => {
  for (const invalida of [-1, -2, 1.5, "5", undefined, null, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const { publicaciones, rechazados } = normalizarApify([{
      ...base, type: "Video", likesCount: invalida, commentsCount: invalida, videoPlayCount: 0,
      displayUrl: "",
    }], "marca_prueba");
    assert.equal(rechazados.length, 0);
    assert.equal(publicaciones[0].post.tipo, "video");
    assert.equal(publicaciones[0].post.caption, null);
    assert.equal(publicaciones[0].post.imagenOrigenUrl, null);
    assert.deepEqual(publicaciones[0].post.hashtags, []);
    assert.deepEqual(publicaciones[0].metricas, { likes: null, comentarios: null, reproducciones: 0 });
  }
});

test("rechaza filas inválidas, ajenas y duplicadas y mantiene las válidas", () => {
  const { publicaciones, rechazados } = normalizarApify([
    null,
    { ...base, timestamp: "2026-02-30T12:00:00Z" },
    { ...base, ownerUsername: "otra" },
    { ...base, type: "Story" },
    { ...base, url: "https://www.instagram.com.ejemplo.test/p/Post_1/" },
    { ...base, url: "https://www.instagram.com/p/Otro/" },
    { ...base, caption: "Inválido\0" },
    base,
    base,
  ], "marca_prueba");
  assert.deepEqual(rechazados.map(({ fila }) => fila), [1, 2, 3, 4, 5, 6, 7, 9]);
  assert.equal(publicaciones[0].post.tipo, "imagen");
  assert.equal(publicaciones.length, 1);
  assert.throws(() => normalizarApify({ items: [] }, "marca_prueba"));
});
