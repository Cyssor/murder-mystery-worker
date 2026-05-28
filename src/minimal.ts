export default {
  async fetch(): Promise<Response> {
    return new Response("ok", {
      headers: { "content-type": "text/plain; charset=utf-8" }
    });
  }
};
