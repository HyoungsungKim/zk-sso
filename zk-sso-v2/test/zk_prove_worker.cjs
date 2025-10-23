// test/zk_prove_worker.cjs
const snarkjs = require("snarkjs");

(async () => {
  // 입력은 부모 프로세스에서 env로 전달
  const input = JSON.parse(process.env.input || "{}");
  const wasm  = process.env.wasm;
  const zkey  = process.env.zkey;
  const perWork = parseInt(process.env.perWork || "1", 10);

  // ffjavascript 멀티스레딩/웹워커 경로 비활성화 (충돌 회피)
  process.env.FFJS_NUM_THREADS = "1";
  process.env.FFJS_FORCE_DISABLE_THREADS = "1";
  global.Worker = undefined;
  global.navigator = { hardwareConcurrency: 1 };

  const times = [];
  for (let i = 0; i < perWork; i++) {
    const t1 = Date.now();
    await snarkjs.groth16.fullProve(input, wasm, zkey);
    const t2 = Date.now();
    times.push(t2 - t1);
  }

  if (process.send) process.send(perWork === 1 ? { ms: times[0] } : { times });
  process.exit(0);
})().catch((e) => {
  if (process.send) process.send({ error: e && (e.message || String(e)) });
  process.exit(1);
});
