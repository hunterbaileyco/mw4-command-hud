// mw4crypto — tiny pure-JS PBKDF2-HMAC-SHA256 + AES-256-GCM decrypt (no deps, no Web Crypto needed).
// Used by the Scriptable widgets (JavaScriptCore has no crypto.subtle). Inlined into each script by
// tools/build-scriptable.mjs between the MW4CRYPTO markers. Verified against Node/Web Crypto output.
const MW4C = (() => {
  const K = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
  const IV = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const W = new Uint32Array(64);
  function block(H, m, o) { // m: Uint8Array, o: offset
    for (let i = 0; i < 16; i++) W[i] = (m[o + 4 * i] << 24) | (m[o + 4 * i + 1] << 16) | (m[o + 4 * i + 2] << 8) | m[o + 4 * i + 3];
    for (let i = 16; i < 64; i++) {
      const a = W[i - 15], b = W[i - 2];
      W[i] = (((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3)) + (((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10)) + W[i - 7] + W[i - 16];
    }
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
      const t2 = ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  function sha256(msg) { // Uint8Array -> Uint8Array(32)
    const H = new Int32Array(IV), n = msg.length, padLen = ((n + 9 + 63) >> 6) << 6, m = new Uint8Array(padLen);
    m.set(msg); m[n] = 0x80; const bits = n * 8;
    m[padLen - 4] = bits >>> 24; m[padLen - 3] = bits >>> 16; m[padLen - 2] = bits >>> 8; m[padLen - 1] = bits;
    m[padLen - 5] = Math.floor(bits / 4294967296);
    for (let o = 0; o < padLen; o += 64) block(H, m, o);
    return h2b(H);
  }
  function h2b(H) { const o = new Uint8Array(32); for (let i = 0; i < 8; i++) { o[4 * i] = H[i] >>> 24; o[4 * i + 1] = H[i] >>> 16; o[4 * i + 2] = H[i] >>> 8; o[4 * i + 3] = H[i]; } return o; }
  function utf8(s) { return new Uint8Array(unescape(encodeURIComponent(s)).split('').map((c) => c.charCodeAt(0))); }
  function pbkdf2(pass, salt, iter, len) { // pass/salt Uint8Array -> Uint8Array(len)
    let key = pass; if (key.length > 64) key = sha256(key);
    const k = new Uint8Array(64); k.set(key);
    const ip = new Uint8Array(64), op = new Uint8Array(64);
    for (let i = 0; i < 64; i++) { ip[i] = k[i] ^ 0x36; op[i] = k[i] ^ 0x5c; }
    const IH = new Int32Array(IV), OH = new Int32Array(IV); block(IH, ip, 0); block(OH, op, 0); // precomputed pads
    const buf = new Uint8Array(64); buf[32] = 0x80; buf[62] = 0x03; buf[63] = 0x00; // 96 bytes * 8 = 768 bits
    const H = new Int32Array(8);
    const fin = (st, data32) => { H.set(st); buf.set(data32, 0); block(H, buf, 0); return h2b(H); };
    const hmac = (data) => { // generic for first round
      const inner = new Uint8Array(64 + data.length); inner.set(ip); inner.set(data, 64);
      const ih = sha256(inner); const outer = new Uint8Array(96); outer.set(op); outer.set(ih, 64); return sha256(outer);
    };
    const out = new Uint8Array(len);
    for (let blk = 1, pos = 0; pos < len; blk++) {
      const s = new Uint8Array(salt.length + 4); s.set(salt); s[salt.length] = blk >>> 24; s[salt.length + 1] = blk >>> 16; s[salt.length + 2] = blk >>> 8; s[salt.length + 3] = blk;
      let u = hmac(s); const t = u.slice();
      for (let i = 1; i < iter; i++) { u = fin(OH, fin(IH, u)); for (let j = 0; j < 32; j++) t[j] ^= u[j]; }
      out.set(t.subarray(0, Math.min(32, len - pos)), pos); pos += 32;
    }
    return out;
  }
  // ---- AES (encrypt direction only; GCM needs only that) ----
  const S = new Uint8Array(256), X2 = (a) => ((a << 1) ^ (a & 0x80 ? 0x1b : 0)) & 0xff;
  (() => { let p = 1, q = 1; do { p = p ^ X2(p); q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 0xff; if (q & 0x80) q ^= 0x09;
    const x = q ^ ((q << 1) | (q >> 7)) ^ ((q << 2) | (q >> 6)) ^ ((q << 3) | (q >> 5)) ^ ((q << 4) | (q >> 4)); S[p] = (x ^ 0x63) & 0xff; } while (p !== 1); S[0] = 0x63; })();
  function expand(key) { // 32-byte key -> 240-byte schedule
    const w = new Uint8Array(240); w.set(key); let rc = 1;
    for (let i = 32; i < 240; i += 4) {
      let t0 = w[i - 4], t1 = w[i - 3], t2 = w[i - 2], t3 = w[i - 1];
      if (i % 32 === 0) { const x = t0; t0 = S[t1] ^ rc; t1 = S[t2]; t2 = S[t3]; t3 = S[x]; rc = X2(rc); }
      else if (i % 32 === 16) { t0 = S[t0]; t1 = S[t1]; t2 = S[t2]; t3 = S[t3]; }
      w[i] = w[i - 32] ^ t0; w[i + 1] = w[i - 31] ^ t1; w[i + 2] = w[i - 30] ^ t2; w[i + 3] = w[i - 29] ^ t3;
    }
    return w;
  }
  function enc(w, inp) { // 16-byte block
    const s = new Uint8Array(16); for (let i = 0; i < 16; i++) s[i] = inp[i] ^ w[i];
    const t = new Uint8Array(16);
    for (let r = 1; r <= 14; r++) {
      for (let i = 0; i < 16; i++) t[i] = S[s[(i + 4 * (i % 4)) % 16]]; // SubBytes + ShiftRows
      if (r < 14) for (let c = 0; c < 4; c++) {
        const a0 = t[4 * c], a1 = t[4 * c + 1], a2 = t[4 * c + 2], a3 = t[4 * c + 3], x = a0 ^ a1 ^ a2 ^ a3;
        s[4 * c] = a0 ^ x ^ X2(a0 ^ a1); s[4 * c + 1] = a1 ^ x ^ X2(a1 ^ a2); s[4 * c + 2] = a2 ^ x ^ X2(a2 ^ a3); s[4 * c + 3] = a3 ^ x ^ X2(a3 ^ a0);
      } else s.set(t);
      for (let i = 0; i < 16; i++) s[i] ^= w[16 * r + i];
    }
    return s;
  }
  function gmul(X, Y) { // GF(2^128) multiply, big-endian bit order
    const Z = new Uint8Array(16), V = Y.slice();
    for (let i = 0; i < 128; i++) {
      if ((X[i >> 3] >> (7 - (i & 7))) & 1) for (let j = 0; j < 16; j++) Z[j] ^= V[j];
      const lsb = V[15] & 1; for (let j = 15; j > 0; j--) V[j] = (V[j] >>> 1) | ((V[j - 1] & 1) << 7); V[0] >>>= 1; if (lsb) V[0] ^= 0xe1;
    }
    return Z;
  }
  function gcmDecrypt(key, iv, data) { // data = ciphertext || 16-byte tag (Web Crypto layout); iv 12 bytes
    const w = expand(key), Hk = enc(w, new Uint8Array(16));
    const ct = data.subarray(0, data.length - 16), tag = data.subarray(data.length - 16);
    let Y = new Uint8Array(16);
    for (let o = 0; o < ct.length; o += 16) { const b = new Uint8Array(16); b.set(ct.subarray(o, o + 16)); for (let j = 0; j < 16; j++) Y[j] ^= b[j]; Y = gmul(Y, Hk); }
    const L = new Uint8Array(16), bits = ct.length * 8; L[15] = bits & 0xff; L[14] = (bits >>> 8) & 0xff; L[13] = (bits >>> 16) & 0xff; L[12] = (bits >>> 24) & 0xff;
    for (let j = 0; j < 16; j++) Y[j] ^= L[j]; Y = gmul(Y, Hk);
    const J = new Uint8Array(16); J.set(iv); J[15] = 1;
    const T = enc(w, J); let bad = 0; for (let j = 0; j < 16; j++) bad |= (T[j] ^ Y[j]) ^ tag[j];
    if (bad) throw new Error('AUTH FAIL');
    const out = new Uint8Array(ct.length), C = J.slice();
    for (let o = 0; o < ct.length; o += 16) {
      for (let j = 15; j >= 12; j--) { C[j] = (C[j] + 1) & 0xff; if (C[j]) break; }
      const ks = enc(w, C); for (let j = 0; j < 16 && o + j < ct.length; j++) out[o + j] = ct[o + j] ^ ks[j];
    }
    return out;
  }
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function b64d(s) { s = s.replace(/[^A-Za-z0-9+/]/g, ''); const o = new Uint8Array((s.length * 3) >> 2); let b = 0, n = 0, p = 0;
    for (const ch of s) { b = (b << 6) | B64.indexOf(ch); n += 6; if (n >= 8) { n -= 8; o[p++] = (b >> n) & 0xff; } } return o.subarray(0, p); }
  function hex(u) { return Array.from(u, (x) => (x < 16 ? '0' : '') + x.toString(16)).join(''); }
  function unhex(h) { const o = new Uint8Array(h.length >> 1); for (let i = 0; i < o.length; i++) o[i] = parseInt(h.substr(2 * i, 2), 16); return o; }
  function utf8d(u) { let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return decodeURIComponent(escape(s)); }
  // envelope: {v,alg:"AES-GCM",kdf:"PBKDF2-SHA256",iter,salt,iv,ct}
  function deriveKey(pass, env) { return pbkdf2(utf8(pass), b64d(env.salt), env.iter, 32); }
  function open(env, keyBytes) { return JSON.parse(utf8d(gcmDecrypt(keyBytes, b64d(env.iv), b64d(env.ct)))); }
  return { sha256, pbkdf2, gcmDecrypt, deriveKey, open, hex, unhex, b64d, utf8 };
})();
