const { handleApi, kvStore, memoryStore } = require("../../../api");

let fallback;

export async function onRequest(context) {
  const store = context.env.ORDERS ? kvStore(context.env.ORDERS) : (fallback ||= memoryStore());
  const result = await handleApi(context.request, store);
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
