// POST a notice (worker/notice.ts) here: it goes through the Mail door, and the door's answer comes back.
type Env = { MAIL: { send(notice: unknown): Promise<unknown> } };

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method !== "POST") return new Response("POST a notice", { status: 405 });
    let notice: unknown;
    try {
      notice = await req.json();
    } catch {
      notice = undefined;
    }
    return Response.json({ reply: await env.MAIL.send(notice) });
  },
};
