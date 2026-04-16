const cloudflareFetch = {
  async fetch(request, env) {
    const path = new URL(request.url).pathname.slice(1);
    const object = await env.ZAP_BUCKET.get(path);

    if (!object) return new Response("Not Found", { status: 404 });

    return new Response(object.body, {
      headers: {
        "Content-Type": object.httpMetadata?.contentType || "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  },
};

export default cloudflareFetch;
