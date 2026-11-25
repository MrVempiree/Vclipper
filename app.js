"use strict";
/* Vclipper — local-first browser clipper/editor with pet assistants.
   Local mode: decode, trim, filter, caption, highlight detection and
   export all happen in this tab. API-key mode: the user's own key is
   kept in localStorage and used only against endpoints they configure. */

function findHighlights(energy, clipSeconds = 15, maxClips = 5) {
  // energy: array of per-second RMS values. Returns ranked clip windows.
  if (!energy.length) return [];
  const windows = [];
  for (let start = 0; start < energy.length; start += 1) {
    const slice = energy.slice(start, start + clipSeconds);
    if (!slice.length) break;
    const score = slice.reduce((a, b) => a + b, 0) / slice.length;
    windows.push({ start, end: Math.min(start + clipSeconds, energy.length), score });
  }
  windows.sort((a, b) => b.score - a.score);
  const picked = [];
  for (const w of windows) {
    if (picked.length >= maxClips) break;
    if (picked.some((p) => w.start < p.end && w.end > p.start)) continue;
    picked.push(w);
  }
  return picked.sort((a, b) => a.start - b.start);
}

function formatTime(s) { return `${s.toFixed(1)}s`; }

function parsePetCommand(text) {
  const t = String(text || "").toLowerCase().trim();
  if (!t) return { action: "none" };
  const nums = [...t.matchAll(/\d+(?:\.\d+)?/g)].map((m) => parseFloat(m[0]));
  if (/(export|download|save|bana do|banao)/.test(t) && /(clip|video|export|download)/.test(t)) return { action: "export" };
  if (/(highlight|best part|acha part|suggest)/.test(t)) return { action: "highlight" };
  if (/(mute|awaz band|sound off)/.test(t)) return { action: "mute", value: true };
  if (/(unmute|awaz on|sound on)/.test(t)) return { action: "mute", value: false };
  const captionMatch = t.match(/(?:caption|text|likho|likh do)\s*[:\-]?\s*(.+)/);
  if (captionMatch && captionMatch[1].trim()) return { action: "caption", value: captionMatch[1].trim() };
  if (/(speed|tez|slow|dheere)/.test(t) && nums.length) return { action: "speed", value: nums[0] };
  if (/(rotate|ghumao|ghuma)/.test(t)) return { action: "rotate" };
  if (/(flip|ulta)/.test(t)) return { action: "flip", value: /(vertical|upar|neeche)/.test(t) ? "v" : "h" };
  if (/(vertical|9:16|reel|shorts)/.test(t)) return { action: "aspect", value: "9:16" };
  if (/(square|1:1)/.test(t)) return { action: "aspect", value: "1:1" };
  if (/(mono|black and white|kala safed)/.test(t)) return { action: "preset", value: "mono" };
  if (/(vivid|rang badhao|colorful)/.test(t)) return { action: "preset", value: "vivid" };
  if (/(warm|garam)/.test(t)) return { action: "preset", value: "warm" };
  if (/(cool|thanda)/.test(t)) return { action: "preset", value: "cool" };
  if (/(vintage|purana look)/.test(t)) return { action: "preset", value: "vintage" };
  if (/(frame|photo|screenshot)/.test(t)) return { action: "frame" };
  if (/(reset|saaf karo|dobara)/.test(t)) return { action: "reset" };
  if (/(clip|trim|kaat|cut)/.test(t) && nums.length >= 2) return { action: "trim", start: nums[0], end: nums[1] };
  if (/(play|chalao|chala)/.test(t)) return { action: "play" };
  if (/(pause|roko|ruk)/.test(t)) return { action: "pause" };
  return { action: "unknown" };
}


if (typeof module !== "undefined" && module.exports) {
  module.exports = { findHighlights, formatTime, parsePetCommand };
}

if (typeof document !== "undefined") {
  const $ = (id) => document.getElementById(id);
  const video = $("preview"), status = $("status");
  let objectUrl = null, duration = 0, energy = [];
  const tf = { rotate: 0, flipH: false, flipV: false };
  const PRESETS = { none: "", vivid: "saturate(160%) contrast(115%)", mono: "grayscale(100%)", warm: "sepia(35%) saturate(130%)", cool: "hue-rotate(15deg) saturate(120%)", vintage: "sepia(55%) contrast(90%) brightness(105%)" };
  function currentFilter() {
    const base = `brightness(${$("brightRange").value}%) contrast(${$("contrastRange").value}%) saturate(${$("satRange").value}%)`;
    const preset = PRESETS[$("presetSel").value] || "";
    return `${base} ${preset}`.trim();
  }
  function applyTransform() {
    video.style.transform = `rotate(${tf.rotate}deg) scaleX(${tf.flipH ? -1 : 1}) scaleY(${tf.flipV ? -1 : 1})`;
  }
  function cropRect() {
    const vw = video.videoWidth || 1280, vh = video.videoHeight || 720;
    const a = $("aspectSel").value;
    if (a === "original") return { sx: 0, sy: 0, sw: vw, sh: vh, w: vw, h: vh };
    const [aw, ah] = a.split(":").map(Number);
    const target = aw / ah, src = vw / vh;
    let sw = vw, sh = vh;
    if (src > target) sw = Math.round(vh * target); else sh = Math.round(vw / target);
    return { sx: Math.round((vw - sw) / 2), sy: Math.round((vh - sh) / 2), sw, sh, w: sw, h: sh };
  }

  function setStatus(msg) { status.textContent = msg; }

  $("fileInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;
    $("emptyState").style.display = "none";
    setStatus(`Loaded ${file.name}. Analysing audio energy…`);
    await analyseAudio(file);
  });

  video.addEventListener("loadedmetadata", () => {
    duration = video.duration || 0;
    $("endLabel").textContent = formatTime(duration);
    syncLabels();
  });

  async function analyseAudio(file) {
    try {
      const buf = await file.arrayBuffer();
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const audio = await ctx.decodeAudioData(buf.slice(0));
      const ch = audio.getChannelData(0);
      const perSecond = Math.floor(audio.sampleRate);
      energy = [];
      for (let i = 0; i < ch.length; i += perSecond) {
        let sum = 0; const end = Math.min(i + perSecond, ch.length);
        for (let j = i; j < end; j++) sum += ch[j] * ch[j];
        energy.push(Math.sqrt(sum / Math.max(1, end - i)));
      }
      drawWaveform();
      setStatus("Audio analysed. Use AI highlight suggestions or set your own trim.");
    } catch {
      energy = [];
      setStatus("Audio analysis unavailable for this file; manual trim still works.");
    }
  }

  function drawWaveform() {
    const c = $("waveform"), g = c.getContext("2d");
    g.clearRect(0, 0, c.width, c.height);
    if (!energy.length) return;
    const max = Math.max(...energy, 0.0001);
    const w = c.width / energy.length;
    g.fillStyle = "#7cc4ff";
    energy.forEach((v, i) => {
      const h = (v / max) * (c.height - 8);
      g.fillRect(i * w, c.height - h, Math.max(1, w - 1), h);
    });
  }

  function clipRange() {
    const start = (parseFloat($("startRange").value) / 100) * duration;
    const end = (parseFloat($("endRange").value) / 100) * duration;
    return { start: Math.min(start, end), end: Math.max(start, end) };
  }
  function syncLabels() {
    const { start, end } = clipRange();
    $("startLabel").textContent = formatTime(start);
    $("endLabel").textContent = formatTime(end);
  }
  ["startRange", "endRange"].forEach((id) => $(id).addEventListener("input", syncLabels));

  $("playClip").addEventListener("click", () => {
    const { start, end } = clipRange();
    video.currentTime = start; video.play();
    const stop = () => { if (video.currentTime >= end) { video.pause(); video.removeEventListener("timeupdate", stop); } };
    video.addEventListener("timeupdate", stop);
  });

  $("suggestBtn").addEventListener("click", () => {
    const box = $("suggestions"); box.innerHTML = "";
    const clips = findHighlights(energy, 15, 5);
    if (!clips.length) { setStatus("No energy data yet — open a video with audio first."); return; }
    clips.forEach((c, i) => {
      const b = document.createElement("button");
      b.textContent = `Highlight ${i + 1}: ${formatTime(c.start)}–${formatTime(c.end)}`;
      b.addEventListener("click", () => {
        $("startRange").value = (c.start / duration) * 100;
        $("endRange").value = (c.end / duration) * 100;
        syncLabels(); $("playClip").click();
      });
      box.appendChild(b);
    });
    setStatus(`${clips.length} highlight windows found from audio energy peaks.`);
  });

  function applyFilters() {
    video.style.filter = currentFilter();
    video.playbackRate = parseFloat($("speedSel").value);
    video.volume = parseFloat($("volumeRange").value) / 100;
  }
  ["brightRange", "contrastRange", "satRange", "speedSel", "presetSel", "volumeRange"].forEach((id) => $(id).addEventListener("input", applyFilters));
  $("rotateBtn").addEventListener("click", () => { tf.rotate = (tf.rotate + 90) % 360; applyTransform(); });
  $("flipHBtn").addEventListener("click", () => { tf.flipH = !tf.flipH; applyTransform(); });
  $("flipVBtn").addEventListener("click", () => { tf.flipV = !tf.flipV; applyTransform(); });
  $("loopCheck").addEventListener("change", () => { video.loop = $("loopCheck").checked; });
  $("frameBtn").addEventListener("click", () => {
    if (!video.src) { setStatus("Open a video first."); return; }
    const r = cropRect();
    const c = document.createElement("canvas"); c.width = r.w; c.height = r.h;
    const g = c.getContext("2d"); g.filter = currentFilter();
    g.drawImage(video, r.sx, r.sy, r.sw, r.sh, 0, 0, r.w, r.h);
    drawCaption(g, r.w, r.h);
    const a = document.createElement("a"); a.href = c.toDataURL("image/png"); a.download = "vclipper-frame.png"; a.click();
    setStatus("Frame captured as vclipper-frame.png");
  });
  $("resetBtn").addEventListener("click", () => {
    tf.rotate = 0; tf.flipH = false; tf.flipV = false; applyTransform();
    $("brightRange").value = 100; $("contrastRange").value = 100; $("satRange").value = 100;
    $("presetSel").value = "none"; $("aspectSel").value = "original"; $("speedSel").value = "1";
    $("volumeRange").value = 100; $("captionText").value = ""; $("muteCheck").checked = false;
    $("fadeInCheck").checked = false; $("fadeOutCheck").checked = false;
    applyFilters(); setStatus("Edits reset.");
  });

  function drawCaption(g, w, h) {
    const text = $("captionText").value.trim();
    if (!text) return;
    g.font = `700 ${Math.round(h * 0.055)}px Inter, sans-serif`;
    g.textAlign = "center";
    g.fillStyle = "rgba(0,0,0,0.55)";
    const tw = g.measureText(text).width + 32;
    g.fillRect((w - tw) / 2, h - h * 0.14, tw, h * 0.09);
    g.fillStyle = "#fff";
    g.fillText(text, w / 2, h - h * 0.075);
  }

  $("exportBtn").addEventListener("click", async () => {
    if (!video.src) { setStatus("Open a video first."); return; }
    const { start, end } = clipRange();
    const r0 = cropRect();
    const rotated = tf.rotate === 90 || tf.rotate === 270;
    const canvas = document.createElement("canvas");
    canvas.width = rotated ? r0.h : r0.w; canvas.height = rotated ? r0.w : r0.h;
    const g = canvas.getContext("2d");
    const stream = canvas.captureStream(30);
    if (!$("muteCheck").checked && video.captureStream) {
      try { video.captureStream().getAudioTracks().forEach((t) => stream.addTrack(t)); } catch { /* video-only export */ }
    }
    const rec = new MediaRecorder(stream, { mimeType: "video/webm" });
    const chunks = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onstop = () => {
      const url = URL.createObjectURL(new Blob(chunks, { type: "video/webm" }));
      const a = document.createElement("a");
      a.href = url; a.download = "vclipper-clip.webm"; a.click();
      setStatus("Clip exported as vclipper-clip.webm");
    };
    setStatus("Exporting… keep this tab in focus.");
    video.currentTime = start;
    await video.play();
    rec.start();
    const draw = () => {
      if (video.currentTime >= end || video.paused) { rec.stop(); video.pause(); return; }
      const r = cropRect();
      g.save();
      g.filter = currentFilter();
      const t = video.currentTime, span = Math.max(0.1, end - start);
      let alpha = 1;
      if ($("fadeInCheck").checked) alpha = Math.min(alpha, (t - start) / Math.min(1, span));
      if ($("fadeOutCheck").checked) alpha = Math.min(alpha, (end - t) / Math.min(1, span));
      g.globalAlpha = Math.max(0, Math.min(1, alpha));
      g.translate(canvas.width / 2, canvas.height / 2);
      g.rotate((tf.rotate * Math.PI) / 180);
      g.scale(tf.flipH ? -1 : 1, tf.flipV ? -1 : 1);
      g.drawImage(video, r.sx, r.sy, r.sw, r.sh, -r.w / 2, -r.h / 2, r.w, r.h);
      g.restore();
      drawCaption(g, canvas.width, canvas.height);
      requestAnimationFrame(draw);
    };
    draw();
  });

  /* ---- API-key mode ---- */
  function setMode(api) {
    $("modeLocal").classList.toggle("active", !api);
    $("modeApi").classList.toggle("active", api);
    $("apiPanel").classList.toggle("hidden", !api);
  }
  $("modeLocal").addEventListener("click", () => setMode(false));
  $("modeApi").addEventListener("click", () => setMode(true));

  $("saveKey").addEventListener("click", () => {
    localStorage.setItem("vclipper_api_base", $("apiBase").value.trim());
    localStorage.setItem("vclipper_api_key", $("apiKey").value.trim());
    localStorage.setItem("vclipper_api_model", $("apiModel").value.trim());
    localStorage.setItem("vclipper_video_endpoint", $("videoEndpoint").value.trim());
    setStatus("API settings saved in this browser only.");
  });
  ["apiBase", "apiKey", "apiModel", "videoEndpoint"].forEach((id) => {
    const key = { apiBase: "vclipper_api_base", apiKey: "vclipper_api_key", apiModel: "vclipper_api_model", videoEndpoint: "vclipper_video_endpoint" }[id];
    const v = localStorage.getItem(key); if (v) $(id).value = v;
  });

  $("aiTitles").addEventListener("click", async () => {
    const base = $("apiBase").value.trim().replace(/\/$/, ""), key = $("apiKey").value.trim(), model = $("apiModel").value.trim() || "gpt-4o-mini";
    if (!base || !key) { setStatus("Set your endpoint and API key first."); return; }
    const clips = findHighlights(energy, 15, 5);
    if (!clips.length) { setStatus("Analyse a video first so there are highlights to name."); return; }
    setStatus("Asking your model for highlight titles…");
    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, messages: [{ role: "user", content: `Give one short catchy title per clip window (seconds): ${clips.map((c) => `${c.start}-${c.end}`).join(", ")}. Reply as a numbered list only.` }] }),
      });
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || "No titles returned.";
      setStatus(text.split("\n").slice(0, 5).join(" · "));
    } catch (err) { setStatus(`API request failed: ${err.message}`); }
  });

  $("genVideo").addEventListener("click", async () => {
    const endpoint = $("videoEndpoint").value.trim(), key = $("apiKey").value.trim(), prompt = $("videoPrompt").value.trim();
    if (!endpoint || !prompt) { setStatus("Set a video endpoint and a prompt first."); return; }
    setStatus("Sending generation request to your endpoint…");
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json().catch(() => ({}));
      const url = data.video_url || data.url || data.output?.[0];
      $("genResult").innerHTML = url ? `<video controls src="${url}"></video>` : `<p class="hint">Endpoint responded without a video URL. Raw keys: ${Object.keys(data).join(", ") || "none"}</p>`;
      setStatus(url ? "Generated video loaded below." : "Generation request completed; check the endpoint response format.");
    } catch (err) { setStatus(`Video generation failed: ${err.message}`); }
  });

  /* ---- Pet assistant: tell the pet, it does the edit ---- */
  const PETS = {
    Gravion: { cls: "", greet: "Main tumhara editing pet hu. Bolo kya karu — clip kaatna, caption, speed, export, sab kar dunga." },
    Vempire: { cls: "vempire", greet: "Main Vempire hu, raat wala editor. Bolo — clip kaato, ulta karo, filter lagao, export karo, sab hoga." },
    Mochi: { cls: "mochi", greet: "Mochi hazir hai! Soft edits, cute captions — bolo kya banau?" },
    Whiskers: { cls: "whiskers", greet: "Captain Whiskers reporting. Precise cuts, no wasted frames. Orders?" },
    Hoot: { cls: "hoot", greet: "Professor Hoot at your service. Highlights, trims, exports — sab hoga, sahi tareeke se." },
    Nova: { cls: "nova", greet: "Nova here — fast edits, bold filters. Bolo, kya dhamaka karna hai?" },
    Rasgulla: { cls: "rasgulla", greet: "Rasgulla hazir! Meethi edits, smooth clips — bolo kya karu?" },
    Jalebi: { cls: "jalebi", greet: "Jalebi ghumegi, video bhi ghumega! Rotate, flip, filter — sab chalega." },
    Panda: { cls: "panda", greet: "Panda slow hai par pakka kaam karta hai. Bolo, clip kahan se kahan tak?" },
    Biscuit: { cls: "biscuit", greet: "Biscuit wafadar hai — jo bologe wahi edit hoga. Command do!" },
  };
  let petName = "Gravion";
  const petSay = (msg) => { $("petBubble").textContent = msg; };
  function setPet(name) {
    if (!PETS[name]) return;
    petName = name;
    $("petAvatar").className = `pet-avatar ${PETS[name].cls}`.trim();
    document.querySelectorAll("[data-pet-name]").forEach((b) => b.classList.toggle("active", b.dataset.petName === name));
    petSay(PETS[name].greet);
  }
  document.querySelectorAll("[data-pet-name]").forEach((b) => b.addEventListener("click", () => setPet(b.dataset.petName)));
  function runPetCommand(raw) {
    const cmd = parsePetCommand(raw);
    if (cmd.action === "trim") {
      if (!duration) { petSay("Pehle ek video kholo, phir main clip kaat dunga."); return; }
      $("startRange").value = (cmd.start / duration) * 100;
      $("endRange").value = (cmd.end / duration) * 100;
      syncLabels(); petSay(`Clip set: ${formatTime(cmd.start)} se ${formatTime(cmd.end)} tak. Play karke dikhau?`);
    } else if (cmd.action === "speed") {
      const opts = [...$("speedSel").options].map((o) => parseFloat(o.value));
      const nearest = opts.reduce((a, b) => Math.abs(b - cmd.value) < Math.abs(a - cmd.value) ? b : a);
      $("speedSel").value = String(nearest); applyFilters(); petSay(`Speed ${nearest}x kar di.`);
    } else if (cmd.action === "caption") {
      $("captionText").value = cmd.value; petSay(`Caption laga diya: "${cmd.value}"`);
    } else if (cmd.action === "mute") {
      $("muteCheck").checked = cmd.value; petSay(cmd.value ? "Export me awaz band kar di." : "Awaz wapas on kar di.");
    } else if (cmd.action === "highlight") {
      $("suggestBtn").click(); petSay("Best parts dhundh liye — neeche highlight buttons dekho.");
    } else if (cmd.action === "export") {
      petSay("Clip export kar raha hu…"); $("exportBtn").click();
    } else if (cmd.action === "rotate") {
      $("rotateBtn").click(); petSay(`Video ${tf.rotate}° ghuma diya.`);
    } else if (cmd.action === "flip") {
      if (cmd.value === "v") $("flipVBtn").click(); else $("flipHBtn").click();
      petSay("Video ulta kar diya.");
    } else if (cmd.action === "aspect") {
      $("aspectSel").value = cmd.value; petSay(`Crop ${cmd.value} kar diya.`);
    } else if (cmd.action === "preset") {
      $("presetSel").value = cmd.value; applyFilters(); petSay(`${cmd.value} filter laga diya.`);
    } else if (cmd.action === "frame") {
      $("frameBtn").click(); petSay("Frame photo bana di.");
    } else if (cmd.action === "reset") {
      $("resetBtn").click(); petSay("Sab edits saaf kar diye.");
    } else if (cmd.action === "play") {
      $("playClip").click(); petSay("Clip chala diya.");
    } else if (cmd.action === "pause") {
      video.pause(); petSay("Rok diya.");
    } else if (cmd.action === "none") {
      petSay("Kuch bolo — jaise: clip 10 se 25 second, caption Hello, export karo.");
    } else {
      petSay("Samjha nahi. Try karo: clip 5 se 20, speed 1.5, caption Mera Clip, highlight dhundho, rotate karo, vertical karo, export karo.");
    }
  }
  $("petSend").addEventListener("click", () => { runPetCommand($("petInput").value); $("petInput").value = ""; });
  $("petInput").addEventListener("keydown", (e) => { if (e.key === "Enter") $("petSend").click(); });
  document.querySelectorAll("[data-pet]").forEach((b) => b.addEventListener("click", () => runPetCommand(b.dataset.pet)));
}
