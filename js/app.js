/* GIRO v0.2.0 – app de ciclismo indoor (PWA offline, dados no IndexedDB). */
(function () {
'use strict';
var VER = '0.2.0';
var $ = function (s) { return document.querySelector(s); };
var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
var MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
var MET = { leve: 4, moderada: 6.8, intensa: 9.5 };
var S = { perfil: null, treinos: [], cfg: { lem: false, hora: '18:00', metas: true, desc: true, sem: true }, plano: null, avisos: {} };
var W = null, tab = 'inicio', tim = null, SENS = [], calM = new Date(), per = 'semana', detalhe = null, ativoSalvo = null, promptInst = null;

/* ---------- Armazenamento (IndexedDB) ---------- */
function db() { return new Promise(function (ok, er) { var r = indexedDB.open('giro', 1); r.onupgradeneeded = function () { r.result.createObjectStore('kv'); }; r.onsuccess = function () { ok(r.result); }; r.onerror = function () { er(r.error); }; }); }
function kvGet(k) { return db().then(function (d) { return new Promise(function (ok) { var q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = function () { ok(q.result); }; q.onerror = function () { ok(); }; }); }).catch(function () { }); }
function kvSet(k, v) { return db().then(function (d) { return new Promise(function (ok) { var t = d.transaction('kv', 'readwrite'); if (v === undefined) t.objectStore('kv').delete(k); else t.objectStore('kv').put(v, k); t.oncomplete = ok; t.onerror = ok; }); }).catch(function () { }); }
function salvar() { return kvSet('estado', S); }
function persist() { if (W) { var c = Object.assign({}, W, { sens: {} }); kvSet('ativo', c); } }

/* ---------- Utilitários ---------- */
function fmt(s) { s = Math.round(s); var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60, p = function (n) { return (n < 10 ? '0' : '') + n; }; return (h ? h + ':' : '') + p(m) + ':' + p(x); }
function dkey(t) { return new Date(t).toLocaleDateString('sv'); }
function ws(d) { var a = new Date(d); a.setHours(0, 0, 0, 0); a.setDate(a.getDate() - (a.getDay() + 6) % 7); return a; }
function soma(l, k) { return l.reduce(function (a, t) { return a + (t[k] || 0); }, 0); }
function tot(l) {
  var s = soma(l, 'dur'), km = soma(l, 'dist'), c = l.filter(function (t) { return t.cad > 0; });
  return { n: l.length, s: s, km: km, kcal: soma(l, 'kcal'), vm: s ? km / (s / 3600) : 0, cad: c.length ? soma(c, 'cad') / c.length : 0 };
}
function emFaixa(a, b) { return S.treinos.filter(function (t) { return t.ts >= a && t.ts < b; }); }
function semanaAtual() { var a = ws(new Date()), b = new Date(a); b.setDate(b.getDate() + 7); return emFaixa(+a, +b); }
function alvo() { var p = S.perfil, t = p.metaTipo; return p.metaValor > 0 ? p.metaValor : (t === 'Distância' ? 20 : t === 'Duração' ? 90 : p.dias || 3); }
function valMeta(l) { var t = S.perfil.metaTipo, x = tot(l); return t === 'Distância' ? x.km : t === 'Duração' ? x.s / 60 : x.n; }
function unMeta() { var t = S.perfil.metaTipo; return t === 'Distância' ? 'km' : t === 'Duração' ? 'min' : 'sessões'; }
function toast(m) { var e = $('#toast'); e.textContent = m; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { e.hidden = true; }, 4200); }
function notificar(t, c) {
  toast(t + ' ' + c);
  if (window.Notification && Notification.permission === 'granted' && navigator.serviceWorker) {
    navigator.serviceWorker.ready.then(function (r) { r.showNotification(t, { body: c, icon: 'icons/icon-192.png', badge: 'icons/favicon.png' }); }).catch(function () { });
  }
}
function baixar(nome, txt, tipo) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: tipo })); a.download = nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000); }
function sel(n, a, v) { return '<select name="' + n + '">' + a.map(function (x) { return '<option' + (x === v ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select>'; }
function dh(t) { var d = new Date(t); return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }

/* ---------- Conquistas, sequência e recordes ---------- */
function seq(L) {
  var ds = Array.from(new Set(L.map(function (t) { return dkey(t.ts); }))).sort(), max = 0, c = 0, prev = null;
  ds.forEach(function (d) { c = prev && (new Date(d) - new Date(prev)) === 864e5 ? c + 1 : 1; max = Math.max(max, c); prev = d; });
  var hoje = dkey(Date.now()), ont = dkey(Date.now() - 864e5), atual = ds.length && (ds[ds.length - 1] === hoje || ds[ds.length - 1] === ont) ? c : 0;
  return { max: max, atual: atual };
}
function conq(L) {
  var x = tot(L), q = seq(L), semanas = {}, metaOk = false;
  L.forEach(function (t) { var k = +ws(t.ts); (semanas[k] = semanas[k] || []).push(t); });
  if (S.perfil) metaOk = Object.keys(semanas).some(function (k) { return valMeta(semanas[k]) >= alvo(); });
  return [
    ['c1', 'Primeira pedalada', 'Complete 1 treino', x.n >= 1], ['c2', 'Constância', 'Complete 10 treinos', x.n >= 10],
    ['c3', 'Veterano', 'Complete 50 treinos', x.n >= 50], ['c4', '25 km', 'Acumule 25 km', x.km >= 25],
    ['c5', '100 km', 'Acumule 100 km', x.km >= 100], ['c6', '5 horas', 'Acumule 5 h de atividade', x.s >= 18000],
    ['c7', 'Sessão longa', 'Uma sessão de 60 min ou mais', L.some(function (t) { return t.dur >= 3600; })],
    ['c8', 'Sequência 3', '3 dias seguidos', q.max >= 3], ['c9', 'Sequência 7', '7 dias seguidos', q.max >= 7],
    ['c10', 'Meta semanal', 'Cumpra a meta semanal', metaOk]
  ];
}
function recordes() {
  var L = S.treinos; if (!L.length) return [];
  var m = function (k) { return L.reduce(function (a, t) { return (t[k] || 0) > (a[k] || 0) ? t : a; }, L[0]); };
  var d = m('dist'), u = m('dur'), v = m('vm'), p = m('pot'), c = m('cad');
  return [['Maior distância', d.dist.toFixed(2) + ' km', d], ['Maior duração', fmt(u.dur), u], ['Maior velocidade média', v.vm.toFixed(1) + ' km/h', v],
    ['Maior potência média', p.pot ? p.pot + ' W' : '–', p], ['Maior cadência média', c.cad ? c.cad + ' rpm' : '–', c]];
}

/* ---------- GIRO Coach (local) ---------- */
function coach() {
  var L = S.treinos, p = S.perfil, o = [];
  if (!L.length) return ['Bem-vindo, ' + p.nome + '! Comece com 20 a 30 minutos em intensidade leve para sentir o ritmo. Registre o esforço percebido ao final.'];
  var ult = L[L.length - 1], dias = Math.floor((Date.now() - ult.ts) / 864e5), q = seq(L);
  var a = ws(new Date()), a0 = new Date(a); a0.setDate(a0.getDate() - 7);
  var este = tot(semanaAtual()), ant = tot(emFaixa(+a0, +a)), prog = valMeta(semanaAtual()) / alvo();
  if (dias >= 4) o.push('Faz ' + dias + ' dias sem pedalar. Retome com uma sessão leve de 20 a 30 minutos e aumente aos poucos.');
  if (q.atual >= 3) o.push('Você treinou ' + q.atual + ' dias seguidos. Considere um dia de descanso ou uma sessão bem leve para recuperar.');
  var r = L.slice(-3).filter(function (t) { return t.rpe; });
  if (r.length >= 2 && r.reduce(function (s, t) { return s + t.rpe; }, 0) / r.length >= 8) o.push('Seus últimos treinos foram muito exigentes (esforço médio alto). Faça um treino leve para recuperar.');
  else if (r.length >= 3 && r.reduce(function (s, t) { return s + t.rpe; }, 0) / r.length <= 4) o.push('Seus treinos recentes pareceram fáceis. Você pode subir a intensidade ou a duração em cerca de 10%.');
  if (ant.s > 0 && este.s > ant.s * 1.3) o.push('Sua carga desta semana está ' + Math.round((este.s / ant.s - 1) * 100) + '% acima da anterior. Prefira aumentos de até 10% por semana.');
  else if (ant.s > 0 && este.s >= ant.s) o.push('Boa evolução: você mantém ou supera a carga da semana passada de forma gradual.');
  if (prog >= 1) o.push('Meta semanal cumprida! Mantenha a regularidade.');
  else o.push('Meta semanal: ' + Math.round(prog * 100) + '% concluída (' + valMeta(semanaAtual()).toFixed(unMeta() === 'sessões' ? 0 : 1) + ' de ' + alvo() + ' ' + unMeta() + ').');
  var prox = S.plano && S.plano.sessoes.filter(function (s) { return !s.done; })[0];
  if (prox) o.push('Próxima sessão do seu plano: ' + prox.titulo + ' (' + prox.dur + ' min).');
  return o;
}

/* ---------- Planos ---------- */
var PLANOS = {
  'Iniciantes': [['livre', 'leve'], ['resistencia', 'leve'], ['livre', 'moderada']],
  'Condicionamento': [['resistencia', 'moderada'], ['livre', 'moderada'], ['intervalado', 'moderada']],
  'Resistência': [['resistencia', 'moderada'], ['resistencia', 'leve'], ['livre', 'moderada']],
  'Controle de peso': [['resistencia', 'moderada'], ['intervalado', 'moderada'], ['livre', 'leve']],
  'Performance': [['intervalado', 'intensa'], ['resistencia', 'moderada'], ['intervalado', 'intensa'], ['livre', 'leve']],
  'Treinos intervalados': [['intervalado', 'moderada'], ['intervalado', 'intensa'], ['livre', 'leve']]
};
var NM = { livre: 'Treino livre', intervalado: 'Intervalado', resistencia: 'Resistência', personalizado: 'Personalizado' };
function gerarPlano(tipo) {
  var p = S.perfil, base = { 'Iniciante': 25, 'Intermediário': 40, 'Avançado': 50, 'Performance': 60 }[p.exp] || 30, f = [0.9, 1, 1.1, 0.8], tpl = PLANOS[tipo], ss = [];
  if (S.treinos.length) { var m = tot(S.treinos.slice(-5)); base = Math.max(base * .6, Math.min(base * 1.2, m.s / m.n / 60 * 1.05 || base)); }
  for (var w = 0; w < 4; w++) for (var i = 0; i < p.dias; i++) {
    var t = tpl[i % tpl.length], d = Math.max(15, Math.min(p.tempo || 60, Math.round(base * f[w] * (t[1] === 'leve' && t[0] === 'resistencia' ? 1.2 : 1) / 5) * 5));
    ss.push({ id: w + '-' + i, sem: w + 1, modo: t[0], int: t[1], dur: d, titulo: NM[t[0]] + ' ' + t[1], done: null });
  }
  S.plano = { tipo: tipo, criado: Date.now(), sessoes: ss };
}

/* ---------- Treino ao vivo ---------- */
function val(k) {
  var s = W.sens[k]; if (s && Date.now() - s.t < 6000) return { v: s.v, s: 'sensor' };
  var m = W.m[k] || 0; if (m > 0) return { v: m, s: 'manual' };
  if (k === 'vel') { var c = val('cad').v; if (c > 0) return { v: +(c * .27).toFixed(1), s: 'estimado' }; }
  return { v: 0, s: '' };
}
function novoW(c) {
  W = { modo: c.modo, nome: c.nome || NM[c.modo], dur: c.dur, int: c.int, obj: c.obj, equip: c.equip, plano: c.plano || null, ini: Date.now(), last: Date.now(), acc: 0, dist: 0, kcal: 0, n: 0, est: 'rodando', laps: [], m: { vel: 0, cad: 0, fc: 0, pot: 0, res: 0 }, sens: {}, sum: { vel: [0, 0], cad: [0, 0], fc: [0, 0], pot: [0, 0] }, fonte: {}, avisou: 0, fase: '' };
  tab = 'treinar'; iniciarTimer(); persist(); render();
}
function iniciarTimer() { clearInterval(tim); tim = setInterval(tick, 1000); }
function tick() {
  if (!W || W.est !== 'rodando') return;
  var n = Date.now(), dt = (n - W.last) / 1000; W.last = n; W.acc += dt;
  W.dist += val('vel').v / 3600 * dt;
  var p = val('pot').v; W.kcal += (p > 0 ? p / 1000 : MET[W.int] * (S.perfil.peso || 70) / 3600) * dt;
  ['vel', 'cad', 'fc', 'pot'].forEach(function (k) { var r = val(k); if (r.v > 0) { W.sum[k][0] += r.v; W.sum[k][1]++; var rk = { sensor: 3, manual: 2, estimado: 1 }; if (!W.fonte[k] || rk[r.s] > rk[W.fonte[k]]) W.fonte[k] = r.s; } });
  if (W.modo === 'intervalado') { var f = W.acc % 90 < 60 ? 'ESFORÇO' : 'RECUPERAÇÃO'; if (f !== W.fase) { if (W.fase && navigator.vibrate) navigator.vibrate(200); W.fase = f; } }
  if (++W.n % 5 === 0) persist();
  if (W.dur && !W.avisou && W.acc >= W.dur * 60) { W.avisou = 1; toast('Tempo da sessão atingido!'); if (navigator.vibrate) navigator.vibrate([300, 100, 300]); }
  paint();
}
function paint() {
  if (!W || !$('#m-tempo')) return;
  var set = function (i, t) { var e = $('#' + i); if (e) e.textContent = t; };
  set('m-tempo', fmt(W.acc));
  ['vel', 'cad', 'fc', 'pot', 'res'].forEach(function (k) { var r = val(k); set('m-' + k, r.v ? (k === 'vel' ? r.v.toFixed(1) : Math.round(r.v)) : '–'); set('s-' + k, r.s || 'sem dado'); });
  set('m-dist', W.dist.toFixed(2)); set('m-kcal', Math.round(W.kcal));
  if (W.modo === 'intervalado') { var t = W.acc % 90; set('fase', W.fase + ' ' + fmt(t < 60 ? 60 - t : 90 - t)); }
  else if (W.modo === 'resistencia') set('fase', 'Mantenha um ritmo constante');
  else set('fase', W.dur ? 'Meta: ' + W.dur + ' min' : 'Pedale no seu ritmo');
  var pr = $('#prog'); if (pr) pr.style.width = (W.dur ? Math.min(100, W.acc / (W.dur * 60) * 100) : 0) + '%';
  $('#bp').hidden = W.est !== 'rodando'; $('#br').hidden = W.est === 'rodando';
}
function finalizar() {
  if (!W) return;
  if (W.acc < 10) { if (!confirm('Treino muito curto. Descartar?')) return; W = null; clearInterval(tim); kvSet('ativo'); render(); return; }
  tick(); var antes = conq(S.treinos).filter(function (c) { return c[3]; }).length;
  var av = function (k) { return W.sum[k][1] ? Math.round(W.sum[k][0] / W.sum[k][1]) : 0; };
  var r = { id: Date.now(), ts: W.ini, dur: Math.round(W.acc), dist: +W.dist.toFixed(2), vm: W.acc ? +(W.dist / (W.acc / 3600)).toFixed(1) : 0, cad: av('cad'), fc: av('fc'), pot: av('pot'), kcal: Math.round(W.kcal), modo: W.modo, nome: W.nome, equip: W.equip, voltas: W.laps, rpe: null, obs: '', fonte: W.fonte, plano: W.plano };
  S.treinos.push(r);
  if (W.plano && S.plano) S.plano.sessoes.forEach(function (s) { if (s.id === W.plano) s.done = r.id; });
  W = null; clearInterval(tim); kvSet('ativo'); salvar();
  conq(S.treinos).filter(function (c) { return c[3]; }).slice(antes).forEach(function (c) { notificar('Conquista desbloqueada!', c[1]); });
  if (S.cfg.metas) { var pg = Math.round(valMeta(semanaAtual()) / alvo() * 100); if (pg >= 100) notificar('Meta semanal', 'Você atingiu sua meta da semana!'); else notificar('Progresso da meta', pg + '% da meta semanal.'); }
  detalhe = r.id; tab = 'resumo'; render(); window.scrollTo(0, 0);
}

/* ---------- Bluetooth (Web Bluetooth) ---------- */
function put(k, v) { if (W) W.sens[k] = { v: v, t: Date.now() }; }
function pHR(dv) { put('fc', dv.getUint8(0) & 1 ? dv.getUint16(1, true) : dv.getUint8(1)); }
function pCSC(dv, e) {
  var f = dv.getUint8(0), o = 1;
  if (f & 1) { var r = dv.getUint32(o, true), t = dv.getUint16(o + 4, true); o += 6; if (e.w) { var dr = r - e.w[0], dt = (t - e.w[1] + 65536) % 65536; if (dt > 0 && dr >= 0) put('vel', dr * 2.096 / (dt / 1024) * 3.6); } e.w = [r, t]; }
  if (f & 2) { var r2 = dv.getUint16(o, true), t2 = dv.getUint16(o + 2, true); if (e.c) { var d2 = (r2 - e.c[0] + 65536) % 65536, dt2 = (t2 - e.c[1] + 65536) % 65536; if (dt2 > 0) put('cad', d2 / (dt2 / 1024) * 60); } e.c = [r2, t2]; }
}
function pPW(dv) { put('pot', dv.getInt16(2, true)); }
function pFT(dv) {
  var f = dv.getUint16(0, true), o = 2;
  if (!(f & 1)) { put('vel', dv.getUint16(o, true) / 100); o += 2; } if (f & 2) o += 2;
  if (f & 4) { put('cad', dv.getUint16(o, true) / 2); o += 2; } if (f & 8) o += 2; if (f & 16) o += 3;
  if (f & 32) { put('res', dv.getInt16(o, true)); o += 2; } if (f & 64) put('pot', dv.getInt16(o, true));
}
var DEFS = [['heart_rate', 'heart_rate_measurement', pHR, 'Freq. cardíaca'], ['cycling_speed_and_cadence', 'csc_measurement', pCSC, 'Velocidade/cadência'], ['cycling_power', 'cycling_power_measurement', pPW, 'Potência'], ['fitness_machine', 'indoor_bike_data', pFT, 'FTMS']];
function ligar(e) {
  e.est = 'conectando'; e.tipos = []; e.w = e.c = null; rs();
  return e.dev.gatt.connect().then(function (srv) {
    return DEFS.reduce(function (p, d) {
      return p.then(function () { return srv.getPrimaryService(d[0]).then(function (s) { return s.getCharacteristic(d[1]); }).then(function (c) { return c.startNotifications().then(function () { c.addEventListener('characteristicvaluechanged', function (ev) { d[2](ev.target.value, e); }); e.tipos.push(d[3]); }); }).catch(function () { }); });
    }, Promise.resolve());
  }).then(function () { e.est = e.tipos.length ? 'conectado' : 'desconectado'; if (!e.tipos.length) toast('Dispositivo sem serviços compatíveis.'); rs(); }).catch(function () { e.est = 'desconectado'; toast('Não foi possível conectar.'); rs(); });
}
function rs() { if (tab === 'treinar' || tab === 'perfil') { var y = window.scrollY; render(); window.scrollTo(0, y); } }
function conectar() {
  var m = $('#btmsg');
  if (!navigator.bluetooth) { if (m) m.textContent = 'Este navegador não tem Bluetooth Web. Use o Chrome no Android (ou o app Android). As métricas continuam podendo ser inseridas manualmente.'; return; }
  var opt = DEFS.map(function (d) { return d[0]; });
  navigator.bluetooth.requestDevice({ filters: opt.map(function (s) { return { services: [s] }; }), optionalServices: opt }).then(function (dev) {
    var e = { nome: dev.name || 'Sensor', dev: dev, est: 'conectando', tipos: [] };
    SENS = SENS.filter(function (x) { return x.dev.id !== dev.id; }); SENS.push(e);
    dev.addEventListener('gattserverdisconnected', function () { e.est = 'desconectado'; rs(); });
    return ligar(e);
  }).catch(function (x) { if (m && x && x.name !== 'NotFoundError') m.textContent = 'Busca cancelada ou indisponível.'; });
}
function vSens() {
  return '<section class="cartao"><h2 class="cartao-titulo">Sensores Bluetooth</h2>' + (SENS.length ? SENS.map(function (s, i) {
    return '<div class="lin"><span>' + esc(s.nome) + '<br><small>' + esc(s.tipos.join(', ')) + '</small></span><b class="' + (s.est === 'conectado' ? 'ok' : '') + '">' + s.est + '</b><button class="mini" data-a="sdesc" data-v="' + i + '">' + (s.est === 'conectado' ? 'Desconectar' : 'Conectar') + '</button></div>';
  }).join('') : '<p class="dica">Nenhum sensor conectado. Aceita monitor cardíaco, sensor de velocidade/cadência, potência e bicicletas FTMS.</p>') + '<button class="btn-sec" data-a="conectar">Buscar dispositivos</button><p class="dica" id="btmsg"></p></section>';
}

/* ---------- Telas ---------- */
function bars(v, l, un) {
  var mx = Math.max.apply(null, v.concat([0.01]));
  return '<div class="bars">' + v.map(function (x, i) { return '<div class="col"><em>' + (x ? x.toFixed(1) : '') + '</em><i data-h="' + (x / mx * 70) + '"></i><span>' + esc(l[i]) + '</span></div>'; }).join('') + '</div>';
}
function boasVindas() {
  return '<section class="cartao wide"><div class="bv"><img src="img/logo-giro.png" alt="Logo GIRO" width="720" height="748"><p class="dica">Vamos conhecer você para personalizar seus treinos. Leva menos de 2 minutos.</p></div></section><section class="cartao wide"><h2 class="cartao-titulo">Questionário inicial</h2>' + formPerfil({}, 'Começar') + '</section>';
}
function formPerfil(p, rot) {
  var ck = function (n, v, t) { return '<label class="chk"><input type="checkbox" name="' + n + '" value="' + esc(v) + '"' + ((n === 'eq' ? (p.eq || []).indexOf(v) >= 0 : p.sens) ? ' checked' : '') + '> ' + t + '</label>'; };
  return '<form class="f" id="fq"><h3>Dados pessoais</h3><label>Nome<input name="nome" required maxlength="40" value="' + esc(p.nome) + '"></label>' +
    '<div class="g2"><label>Idade<input name="idade" type="number" inputmode="numeric" min="10" max="100" required value="' + esc(p.idade) + '"></label><label>Sexo (opcional)' + sel('sexo', ['Prefiro não informar', 'Feminino', 'Masculino', 'Outro'], p.sexo) + '</label>' +
    '<label>Altura (cm)<input name="altura" type="number" inputmode="numeric" min="100" max="230" required value="' + esc(p.altura) + '"></label><label>Peso (kg)<input name="peso" type="number" inputmode="decimal" step="0.1" min="30" max="250" required value="' + esc(p.peso) + '"></label></div>' +
    '<h3>Experiência e objetivo</h3><div class="g2"><label>Nível' + sel('exp', ['Iniciante', 'Intermediário', 'Avançado', 'Performance'], p.exp) + '</label><label>Objetivo' + sel('obj', ['Saúde e bem-estar', 'Condicionamento', 'Resistência', 'Controle de peso', 'Performance'], p.obj) + '</label></div>' +
    '<h3>Disponibilidade</h3><div class="g2"><label>Dias por semana<input name="dias" type="number" inputmode="numeric" min="1" max="7" required value="' + esc(p.dias || 3) + '"></label><label>Minutos por sessão<input name="tempo" type="number" inputmode="numeric" min="10" max="240" required value="' + esc(p.tempo || 40) + '"></label></div><label>Horário preferido' + sel('horario', ['Manhã', 'Tarde', 'Noite'], p.horario) + '</label>' +
    '<h3>Equipamentos</h3>' + ck('eq', 'Bicicleta ergométrica', 'Bicicleta ergométrica') + ck('eq', 'Spinning', 'Spinning') + ck('eq', 'Simulador indoor', 'Simulador indoor') + ck('sens', '1', 'Tenho sensores Bluetooth') +
    '<h3>Preferências</h3><div class="g2"><label>Intensidade' + sel('intens', ['Leve', 'Moderada', 'Intensa'], p.intens) + '</label><label>Tipo de treino' + sel('tipo', ['Contínuos', 'Intervalados', 'Variados'], p.tipo) + '</label>' +
    '<label>Meta por' + sel('metaTipo', ['Regularidade', 'Distância', 'Duração'], p.metaTipo) + '</label><label>Meta semanal (sessões, km ou min)<input name="metaValor" type="number" inputmode="decimal" min="0" value="' + esc(p.metaValor || '') + '"></label></div>' +
    '<button class="btn-principal" type="submit">' + rot + '</button></form>';
}
function vInicio() {
  var p = S.perfil, h = new Date().getHours(), x = tot(S.treinos), u = S.treinos[S.treinos.length - 1], sm = semanaAtual(), pr = Math.min(100, valMeta(sm) / alvo() * 100), o = '';
  if (ativoSalvo && !W) o += '<section class="cartao wide"><h2 class="cartao-titulo">Treino interrompido</h2><p class="dica">Encontramos um treino não finalizado (' + fmt(ativoSalvo.acc) + ').</p><button class="btn-principal" data-a="recAtivo">Retomar treino</button><button class="btn-sec" data-a="salvAtivo">Finalizar e salvar</button><button class="btn-sec perigo" data-a="descAtivo">Descartar</button></section>';
  o += '<section class="cartao wide"><div class="ola">' + (h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite') + ', ' + esc(p.nome) + '!</div><div class="g2" style="margin-top:12px"><div class="t"><b>' + x.n + '</b><small>Treinos</small></div><div class="t"><b>' + fmt(x.s) + '</b><small>Tempo acumulado</small></div><div class="t"><b>' + x.km.toFixed(1) + ' km</b><small>Distância</small></div><div class="t"><b>' + Math.round(x.kcal) + '</b><small>kcal estimadas</small></div></div><button class="btn-principal" data-a="tab" data-v="treinar">' + (W ? 'Voltar ao treino ao vivo' : 'Iniciar atividade') + '</button></section>';
  o += '<section class="cartao"><h2 class="cartao-titulo">Meta semanal</h2><b>' + valMeta(sm).toFixed(unMeta() === 'sessões' ? 0 : 1) + ' / ' + alvo() + ' ' + unMeta() + '</b><div class="barra"><i data-w="' + pr + '"></i></div><small class="dica">Sequência atual: ' + seq(S.treinos).atual + ' dia(s)</small></section>';
  o += '<section class="cartao"><h2 class="cartao-titulo">Último treino</h2>' + (u ? '<div class="lin"><span>' + esc(u.nome || NM[u.modo]) + '<br><small>' + dh(u.ts) + '</small></span><b>' + u.dist.toFixed(2) + ' km · ' + fmt(u.dur) + '</b></div><button class="btn-sec" data-a="ver" data-v="' + u.id + '">Ver resumo</button>' : '<p class="dica">Nenhum treino ainda.</p>') + '</section>';
  var a = ws(new Date()), v = [], l = [];
  for (var i = 6; i >= 0; i--) { var s = new Date(a); s.setDate(s.getDate() - 7 * i); var e = new Date(s); e.setDate(e.getDate() + 7); v.push(tot(emFaixa(+s, +e)).km); l.push(s.getDate() + '/' + (s.getMonth() + 1)); }
  o += '<section class="cartao"><h2 class="cartao-titulo">Evolução (km/semana)</h2>' + bars(v, l) + '</section>';
  o += '<section class="cartao"><h2 class="cartao-titulo">GIRO Coach</h2>' + coach().map(function (c) { return '<p class="dica">• ' + esc(c) + '</p>'; }).join('') + '<p class="dica"><small>Coach local, funciona offline. A IA conectada depende de internet e de um backend seguro (não incluso nesta versão).</small></p></section>';
  return o;
}
function vTreinar() {
  if (W) return vLive();
  var p = S.perfil, eq = p.eq && p.eq.length ? p.eq : ['Bicicleta ergométrica', 'Spinning', 'Simulador indoor'], md = p.tipo === 'Intervalados' ? 'intervalado' : 'livre';
  var cfg = '<section class="cartao"><h2 class="cartao-titulo">Central de treinamento</h2><form class="f" id="fc"><label>Modalidade<select name="modo"><option value="livre"' + (md === 'livre' ? ' selected' : '') + '>Treino livre</option><option value="intervalado"' + (md === 'intervalado' ? ' selected' : '') + '>Intervalado (60s esforço / 30s recuperação)</option><option value="resistencia">Resistência</option><option value="personalizado">Personalizado</option></select></label>' +
    '<label>Nome da sessão (personalizado)<input name="nome" maxlength="40"></label><div class="g2"><label>Duração (min, 0 = livre)<input name="dur" type="number" inputmode="numeric" min="0" max="300" value="' + (md === 'livre' ? 0 : p.tempo) + '"></label><label>Intensidade' + sel('int', ['leve', 'moderada', 'intensa'], (p.intens || 'Moderada').toLowerCase()) + '</label></div><label>Equipamento' + sel('equip', eq, eq[0]) + '</label><label>Objetivo' + sel('obj', ['Condicionamento', 'Distância', 'Duração', 'Regularidade'], 'Condicionamento') + '</label><button class="btn-principal" type="submit">Iniciar treino</button></form></section>';
  var pl = S.plano ? '<div class="sub">Plano ' + esc(S.plano.tipo) + '</div>' + [1, 2, 3, 4].map(function (w) {
    return '<div class="sub" style="color:var(--prata)">Semana ' + w + '</div>' + S.plano.sessoes.filter(function (s) { return s.sem === w; }).map(function (s) { return '<div class="sess"><span>' + esc(s.titulo) + ' · ' + s.dur + ' min</span>' + (s.done ? '<b class="ok">✓ feito</b>' : '<button class="mini" data-a="iniPlano" data-v="' + s.id + '">Iniciar</button>') + '</div>'; }).join('');
  }).join('') : '<p class="dica">Gere um plano de 4 semanas com base no seu perfil e histórico.</p>';
  pl = '<section class="cartao"><h2 class="cartao-titulo">Planos de treinamento</h2><form class="f" id="fp">' + '<label>Tipo de plano' + sel('plano', Object.keys(PLANOS), S.plano ? S.plano.tipo : p.obj === 'Performance' ? 'Performance' : p.exp === 'Iniciante' ? 'Iniciantes' : p.obj === 'Controle de peso' ? 'Controle de peso' : p.obj === 'Resistência' ? 'Resistência' : 'Condicionamento') + '</label><button class="btn-sec" type="submit">' + (S.plano ? 'Gerar novo plano' : 'Gerar plano') + '</button></form>' + pl + '</section>';
  return cfg + pl + vSens();
}
function vLive() {
  var M = [['vel', 'Velocidade', 'km/h', 1], ['dist', 'Distância', 'km', 0], ['cad', 'Cadência', 'RPM', 5], ['fc', 'Freq. cardíaca', 'BPM', 5], ['pot', 'Potência', 'W', 10], ['kcal', 'Calorias', 'kcal', 0], ['res', 'Resistência', 'nível do equipamento', 1]];
  return '<section class="cartao wide"><h2 class="cartao-titulo">' + esc(W.nome) + ' · ' + esc(W.equip) + '</h2><div class="tempo" id="m-tempo">00:00</div><div class="fase" id="fase"></div><div class="barra"><i id="prog"></i></div><div class="mgrid">' + M.map(function (m) {
    return '<div class="m"><small>' + m[1] + ' · <b class="sb" id="s-' + m[0] + '">' + (m[0] === 'dist' ? 'calculada' : m[0] === 'kcal' ? 'estimada' : '') + '</b></small><span id="m-' + m[0] + '">0</span><u>' + m[2] + '</u>' + (m[3] ? '<div class="st"><button data-a="step" data-v="' + m[0] + ':-' + m[3] + '" aria-label="Diminuir">−</button><button data-a="step" data-v="' + m[0] + ':' + m[3] + '" aria-label="Aumentar">+</button></div>' : '') + '</div>';
  }).join('') + '</div><div class="bts"><button id="bp" class="go" data-a="pausar">Pausar</button><button id="br" class="go" data-a="retomar" hidden>Retomar</button><button data-a="volta">Volta</button><button class="stop" data-a="finalizar">Finalizar</button></div>' +
    (W.laps.length ? '<div class="sub">Voltas</div>' + W.laps.map(function (l, i) { return '<div class="lin"><span>Volta ' + (i + 1) + '</span><b>' + fmt(l.t - (i ? W.laps[i - 1].t : 0)) + ' · ' + (l.d - (i ? W.laps[i - 1].d : 0)).toFixed(2) + ' km</b></div>'; }).join('') : '') + '<p class="dica">Use + / − para atualizar os dados manualmente. Valores de sensores têm prioridade e voltam ao manual se o sinal cair.</p></section>' + vSens();
}
function vResumo() {
  var t = S.treinos.filter(function (x) { return x.id === detalhe; })[0]; if (!t) return '<section class="cartao"><p>Treino não encontrado.</p></section>';
  var sim = S.treinos.filter(function (x) { return x.modo === t.modo && x.id < t.id; }).pop(), f = t.fonte || {}, og = function (k) { return f[k] ? ' <small>(' + ({ sensor: 'sensor', manual: 'manual', estimado: 'estimado' }[f[k]]) + ')</small>' : ' <small>(sem dados)</small>'; };
  var dif = function (a, b, un) { var d = a - b; return '<span class="' + (d >= 0 ? 'pos' : 'neg') + '">' + (d >= 0 ? '+' : '') + d.toFixed(1) + ' ' + un + '</span>'; };
  return '<section class="cartao wide"><h2 class="cartao-titulo">Resumo do treino</h2><div class="g2"><div class="t"><b>' + fmt(t.dur) + '</b><small>Duração</small></div><div class="t"><b>' + t.dist.toFixed(2) + ' km</b><small>Distância</small></div><div class="t"><b>' + t.vm.toFixed(1) + ' km/h</b><small>Vel. média' + og('vel') + '</small></div><div class="t"><b>' + (t.cad || '–') + '</b><small>Cadência média (rpm)' + og('cad') + '</small></div><div class="t"><b>' + (t.fc || '–') + '</b><small>FC média (bpm)' + og('fc') + '</small></div><div class="t"><b>' + (t.pot || '–') + '</b><small>Potência média (W)' + og('pot') + '</small></div><div class="t"><b>' + t.kcal + '</b><small>kcal estimadas</small></div><div class="t"><b>' + esc(t.nome || NM[t.modo]) + '</b><small>' + esc(t.equip) + '</small></div></div><p class="dica">' + dh(t.ts) + ' · ' + (t.voltas || []).length + ' volta(s)</p>' +
    (sim ? '<p class="dica">Comparado ao último treino semelhante: ' + dif(t.dist, sim.dist, 'km') + ' · ' + dif(t.vm, sim.vm, 'km/h') + ' · ' + dif(t.dur / 60, sim.dur / 60, 'min') + '</p>' : '') +
    '<div class="f"><label>Esforço percebido (1 a 10)<select data-c="rpe:x"><option value="">Selecione</option>' + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (n) { return '<option' + (t.rpe === n ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></label><label>Observações<textarea rows="3" maxlength="500" data-c="obs:x">' + esc(t.obs) + '</textarea></label></div><p class="dica">Treino salvo automaticamente no histórico.</p><button class="btn-principal" data-a="tab" data-v="hist">Ver histórico</button><button class="btn-sec perigo" data-a="apagar" data-v="' + t.id + '">Excluir treino</button></section>';
}
function bk() {
  var h = new Date(); h.setHours(0, 0, 0, 0); var o = [], i, a, b;
  if (per === 'dia') for (i = 6; i >= 0; i--) { a = new Date(h); a.setDate(a.getDate() - i); b = new Date(a); b.setDate(b.getDate() + 1); o.push([+a, +b, a.getDate() + '/' + (a.getMonth() + 1)]); }
  else if (per === 'semana') { var w = ws(h); for (i = 7; i >= 0; i--) { a = new Date(w); a.setDate(a.getDate() - 7 * i); b = new Date(a); b.setDate(b.getDate() + 7); o.push([+a, +b, a.getDate() + '/' + (a.getMonth() + 1)]); } }
  else for (i = 5; i >= 0; i--) { a = new Date(h.getFullYear(), h.getMonth() - i, 1); b = new Date(h.getFullYear(), h.getMonth() - i + 1, 1); o.push([+a, +b, MES[a.getMonth()]]); }
  return o;
}
function vHist() {
  var B = bk(), T = B.map(function (b) { return tot(emFaixa(b[0], b[1])); }), c = T[T.length - 1], a = T[T.length - 2];
  var cmp = function (k, un, d) { var x = c[k] - a[k]; return '<span class="' + (x >= 0 ? 'pos' : 'neg') + '">' + (x >= 0 ? '+' : '') + x.toFixed(d) + un + '</span>'; };
  var o = '<section class="cartao"><h2 class="cartao-titulo">Estatísticas</h2><div class="seg">' + [['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês']].map(function (x) { return '<button data-a="per" data-v="' + x[0] + '"' + (per === x[0] ? ' class="on"' : '') + '>' + x[1] + '</button>'; }).join('') + '</div>' + bars(T.map(function (x) { return x.km; }), B.map(function (b) { return b[2]; })) + '<p class="dica">Distância (km) por ' + per + '</p></section>';
  o += '<section class="cartao"><h2 class="cartao-titulo">Período atual × anterior</h2><div class="lin"><span>Sessões</span><b>' + c.n + ' ' + cmp('n', '', 0) + '</b></div><div class="lin"><span>Tempo</span><b>' + fmt(c.s) + ' ' + cmp('s', ' s', 0) + '</b></div><div class="lin"><span>Distância</span><b>' + c.km.toFixed(1) + ' km ' + cmp('km', ' km', 1) + '</b></div><div class="lin"><span>Velocidade média</span><b>' + c.vm.toFixed(1) + ' km/h ' + cmp('vm', '', 1) + '</b></div><div class="lin"><span>Cadência média</span><b>' + Math.round(c.cad) + ' rpm</b></div><div class="lin"><span>Calorias</span><b>' + Math.round(c.kcal) + ' kcal</b></div></section>';
  var y = calM.getFullYear(), m = calM.getMonth(), ini = new Date(y, m, 1).getDay(), nd = new Date(y, m + 1, 0).getDate(), dias = {}, cal = '';
  S.treinos.forEach(function (t) { dias[dkey(t.ts)] = 1; });
  for (var i = 0; i < ini; i++) cal += '<span></span>';
  for (var d = 1; d <= nd; d++) { var k = dkey(new Date(y, m, d)); cal += '<span class="' + (dias[k] ? 'tem' : '') + (k === dkey(Date.now()) ? ' hj' : '') + '">' + d + '</span>'; }
  o += '<section class="cartao"><h2 class="cartao-titulo">Calendário</h2><div class="lin"><button class="mini" data-a="mes" data-v="-1">‹</button><b>' + MES[m] + ' ' + y + '</b><button class="mini" data-a="mes" data-v="1">›</button></div><div class="cal">' + ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(function (x) { return '<b>' + x + '</b>'; }).join('') + cal + '</div></section>';
  o += '<section class="cartao"><h2 class="cartao-titulo">Recordes pessoais</h2>' + (recordes().map(function (r) { return '<div class="lin"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>'; }).join('') || '<p class="dica">Registre treinos para ver seus recordes.</p>') + '</section>';
  o += '<section class="cartao wide"><h2 class="cartao-titulo">Histórico de treinos</h2>' + (S.treinos.slice().reverse().map(function (t) { return '<div class="lin"><span>' + esc(t.nome || NM[t.modo]) + '<br><small>' + dh(t.ts) + '</small></span><b>' + t.dist.toFixed(2) + ' km · ' + fmt(t.dur) + '</b><button class="mini" data-a="ver" data-v="' + t.id + '">Abrir</button></div>'; }).join('') || '<p class="dica">Nenhum treino registrado.</p>') + '<button class="btn-sec" data-a="csv">Exportar relatório (CSV)</button><button class="btn-sec" data-a="json">Exportar backup (JSON)</button></section>';
  return o;
}
function vMetas() {
  var sm = semanaAtual(), a = new Date(), ms = emFaixa(+new Date(a.getFullYear(), a.getMonth(), 1), +new Date(a.getFullYear(), a.getMonth() + 1, 1)), q = seq(S.treinos), C = conq(S.treinos);
  var pr = Math.min(100, valMeta(sm) / alvo() * 100), mk = tot(ms).km, mal = Math.max(1, Math.round(alvo() * 4.3 * (unMeta() === 'sessões' ? 0 : 1)) || 1);
  var mm = unMeta() === 'sessões' ? ms.length + ' / ' + Math.round(alvo() * 4.3) + ' sessões' : valMeta(ms).toFixed(1) + ' / ' + Math.round(alvo() * 4.3) + ' ' + unMeta();
  var prm = Math.min(100, valMeta(ms) / (alvo() * 4.3) * 100);
  return '<section class="cartao"><h2 class="cartao-titulo">Meta semanal</h2><b>' + valMeta(sm).toFixed(unMeta() === 'sessões' ? 0 : 1) + ' / ' + alvo() + ' ' + unMeta() + '</b><div class="barra"><i data-w="' + pr + '"></i></div><p class="dica">Altere o tipo e o valor da meta no Perfil.</p></section>' +
    '<section class="cartao"><h2 class="cartao-titulo">Meta mensal</h2><b>' + mm + '</b><div class="barra"><i data-w="' + prm + '"></i></div><p class="dica">Distância no mês: ' + mk.toFixed(1) + ' km</p></section>' +
    '<section class="cartao"><h2 class="cartao-titulo">Sequências</h2><div class="g2"><div class="t"><b>' + q.atual + '</b><small>Sequência atual (dias)</small></div><div class="t"><b>' + q.max + '</b><small>Melhor sequência</small></div></div></section>' +
    '<section class="cartao wide"><h2 class="cartao-titulo">Medalhas e conquistas (' + C.filter(function (c) { return c[3]; }).length + '/' + C.length + ')</h2>' + C.map(function (c) { return '<div class="lin conq' + (c[3] ? ' ok' : '') + '"><span><b>' + (c[3] ? '🏅 ' : '🔒 ') + esc(c[1]) + '</b><br><small>' + esc(c[2]) + '</small></span></div>'; }).join('') + '</section>';
}
function vPerfil() {
  var c = S.cfg, tg = function (k, t) { return '<label class="chk"><input type="checkbox" data-c="cfg:' + k + '"' + (c[k] ? ' checked' : '') + '> ' + t + '</label>'; };
  var perm = window.Notification ? Notification.permission : 'indisponível';
  return '<section class="cartao"><h2 class="cartao-titulo">Dados e preferências</h2>' + formPerfil(S.perfil, 'Salvar perfil') + '</section><div style="display:grid;gap:16px;align-content:start">' +
    '<section class="cartao"><h2 class="cartao-titulo">Notificações</h2><div class="f">' + tg('lem', 'Lembrete de treino') + '<label>Horário do lembrete<input type="time" value="' + esc(c.hora) + '" data-c="hora:x"></label>' + tg('metas', 'Progresso de metas e conquistas') + tg('desc', 'Recuperação e descanso') + tg('sem', 'Resumo semanal (domingo)') + '</div><p class="dica">Permissão do navegador: ' + perm + '. Os lembretes são exibidos com o app aberto ou em segundo plano no aparelho.</p></section>' +
    vSens() +
    '<section class="cartao"><h2 class="cartao-titulo">Backup e privacidade</h2><p class="dica">Seus dados ficam somente neste aparelho (IndexedDB). Nada é enviado para a internet.</p><button class="btn-sec" data-a="json">Exportar backup (JSON)</button><button class="btn-sec" data-a="restaurar">Restaurar backup</button><input type="file" id="arq" accept="application/json,.json" hidden><button class="btn-sec perigo" data-a="limpar">Apagar todos os dados</button>' + (promptInst ? '<button class="btn-sec" data-a="instalar">Instalar o GIRO</button>' : '') + '<p class="dica">GIRO v' + VER + '</p></section></div>';
}

/* ---------- Render e eventos ---------- */
function render() {
  var v = $('#v'), nav = $('#nav');
  if (!S.perfil) { nav.hidden = true; v.innerHTML = boasVindas(); }
  else {
    nav.hidden = false;
    nav.innerHTML = [['inicio', 'Início'], ['treinar', 'Treinar'], ['hist', 'Histórico'], ['metas', 'Metas'], ['perfil', 'Perfil']].map(function (x) { return '<button data-a="tab" data-v="' + x[0] + '"' + (tab === x[0] || (tab === 'resumo' && x[0] === 'hist') ? ' class="on"' : '') + '>' + x[1] + '</button>'; }).join('');
    v.innerHTML = ({ inicio: vInicio, treinar: vTreinar, hist: vHist, metas: vMetas, perfil: vPerfil, resumo: vResumo })[tab]();
  }
  v.querySelectorAll('[data-h]').forEach(function (e) { e.style.height = e.dataset.h + '%'; });
  v.querySelectorAll('[data-w]').forEach(function (e) { e.style.width = e.dataset.w + '%'; });
  if (W && tab === 'treinar') paint();
}
function lerPerfil(f) {
  var d = new FormData(f), p = {};
  ['nome', 'sexo', 'exp', 'obj', 'horario', 'intens', 'tipo', 'metaTipo'].forEach(function (k) { p[k] = d.get(k) || ''; });
  ['idade', 'altura', 'peso', 'dias', 'tempo', 'metaValor'].forEach(function (k) { p[k] = +d.get(k) || 0; });
  p.eq = d.getAll('eq'); p.sens = !!d.get('sens'); p.nome = p.nome.trim(); return p;
}
var A = {
  tab: function (v) { tab = v; render(); window.scrollTo(0, 0); },
  step: function (v) { if (!W) return; var x = v.split(':'); W.m[x[0]] = Math.max(0, (W.m[x[0]] || 0) + +x[1]); paint(); },
  pausar: function () { tick(); W.est = 'pausado'; persist(); paint(); },
  retomar: function () { W.last = Date.now(); W.est = 'rodando'; persist(); paint(); },
  volta: function () { W.laps.push({ t: W.acc, d: W.dist }); persist(); render(); toast('Volta ' + W.laps.length + ' registrada'); },
  finalizar: function () { if (confirm('Finalizar o treino?')) finalizar(); },
  conectar: conectar,
  sdesc: function (i) { var e = SENS[i]; if (!e) return; if (e.est === 'conectado') { try { e.dev.gatt.disconnect(); } catch (x) { } e.est = 'desconectado'; rs(); } else ligar(e); },
  per: function (v) { per = v; render(); },
  mes: function (v) { calM = new Date(calM.getFullYear(), calM.getMonth() + +v, 1); render(); },
  ver: function (v) { detalhe = +v; tab = 'resumo'; render(); window.scrollTo(0, 0); },
  apagar: function (v) { if (confirm('Excluir este treino?')) { S.treinos = S.treinos.filter(function (t) { return t.id !== +v; }); salvar(); tab = 'hist'; render(); } },
  iniPlano: function (v) { var s = S.plano.sessoes.filter(function (x) { return x.id === v; })[0]; if (s) novoW({ modo: s.modo, nome: s.titulo, dur: s.dur, int: s.int, obj: 'Condicionamento', equip: (S.perfil.eq && S.perfil.eq[0]) || 'Bicicleta ergométrica', plano: s.id }); },
  recAtivo: function () { W = ativoSalvo; W.sens = {}; W.est = 'pausado'; W.last = Date.now(); ativoSalvo = null; tab = 'treinar'; iniciarTimer(); render(); },
  salvAtivo: function () { A.recAtivo(); finalizar(); },
  descAtivo: function () { if (confirm('Descartar o treino interrompido?')) { ativoSalvo = null; kvSet('ativo'); render(); } },
  json: function () { baixar('giro-backup-' + dkey(Date.now()) + '.json', JSON.stringify({ app: 'GIRO', versao: VER, data: new Date().toISOString(), estado: S }, null, 1), 'application/json'); },
  csv: function () {
    var l = ['data;modalidade;equipamento;duracao_s;distancia_km;vel_media;cad_media;fc_media;pot_media;kcal;esforco;obs'];
    S.treinos.forEach(function (t) { l.push([dh(t.ts), t.nome || NM[t.modo], t.equip, t.dur, t.dist, t.vm, t.cad, t.fc, t.pot, t.kcal, t.rpe || '', '"' + String(t.obs || '').replace(/"/g, '""') + '"'].join(';')); });
    baixar('giro-relatorio-' + dkey(Date.now()) + '.csv', '\ufeff' + l.join('\n'), 'text/csv');
  },
  restaurar: function () { $('#arq').click(); },
  limpar: function () { if (confirm('Apagar TODOS os dados deste aparelho? Exporte um backup antes.') && confirm('Tem certeza? Isso não pode ser desfeito.')) { S = { perfil: null, treinos: [], cfg: S.cfg, plano: null, avisos: {} }; W = null; kvSet('ativo'); salvar(); tab = 'inicio'; render(); } },
  instalar: function () { if (promptInst) { promptInst.prompt(); promptInst.userChoice.then(function () { promptInst = null; render(); }); } }
};
var C = {
  cfg: function (k, el) { S.cfg[k] = el.checked; if (el.checked && k !== 'sem' && window.Notification && Notification.permission === 'default') Notification.requestPermission().then(render); salvar(); },
  hora: function (x, el) { S.cfg.hora = el.value || '18:00'; salvar(); },
  rpe: function (x, el) { var t = S.treinos.filter(function (q) { return q.id === detalhe; })[0]; if (t) { t.rpe = +el.value || null; salvar(); } },
  obs: function (x, el) { var t = S.treinos.filter(function (q) { return q.id === detalhe; })[0]; if (t) { t.obs = el.value.slice(0, 500); salvar(); } }
};
document.addEventListener('click', function (e) { var b = e.target.closest('[data-a]'); if (b && A[b.dataset.a]) A[b.dataset.a](b.dataset.v, b); });
document.addEventListener('change', function (e) {
  var t = e.target;
  if (t.id === 'arq' && t.files[0]) {
    t.files[0].text().then(function (x) { var j = JSON.parse(x), s = j.estado || j; if (!s || !Array.isArray(s.treinos)) throw 0; if (!confirm('Substituir os dados atuais pelo backup?')) return; S = Object.assign({ perfil: null, treinos: [], cfg: S.cfg, plano: null, avisos: {} }, s); salvar(); render(); toast('Backup restaurado'); }).catch(function () { toast('Arquivo de backup inválido.'); });
    return;
  }
  if (t.dataset.c) { var p = t.dataset.c.split(':'); C[p[0]](p[1], t); }
});
document.addEventListener('submit', function (e) {
  e.preventDefault(); var f = e.target;
  if (f.id === 'fq') {
    var novo = !S.perfil; S.perfil = lerPerfil(f); salvar(); if (novo) { tab = 'inicio'; toast('Perfil salvo. Bem-vindo ao GIRO!'); if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } else toast('Perfil atualizado.');
    render(); window.scrollTo(0, 0);
  } else if (f.id === 'fc') {
    var d = new FormData(f); novoW({ modo: d.get('modo'), nome: (d.get('nome') || '').trim().slice(0, 40), dur: +d.get('dur') || 0, int: d.get('int'), obj: d.get('obj'), equip: d.get('equip') });
  } else if (f.id === 'fp') { gerarPlano(new FormData(f).get('plano')); salvar(); render(); toast('Plano gerado!'); }
});

/* ---------- Lembretes ---------- */
function lembretes() {
  var h = new Date(), hoje = dkey(h), hm = ('0' + h.getHours()).slice(-2) + ':' + ('0' + h.getMinutes()).slice(-2), c = S.cfg, av = S.avisos;
  if (!S.perfil) return;
  var treinou = S.treinos.some(function (t) { return dkey(t.ts) === hoje; });
  if (c.lem && hm === c.hora && av.lem !== hoje && !treinou && !W) { av.lem = hoje; notificar('Hora de pedalar!', 'Seu treino de hoje está esperando.'); salvar(); }
  if (c.sem && h.getDay() === 0 && hm >= '18:00' && av.sem !== hoje) { av.sem = hoje; var x = tot(semanaAtual()); notificar('Resumo semanal', x.n + ' treino(s), ' + x.km.toFixed(1) + ' km, ' + fmt(x.s) + '.'); salvar(); }
  if (c.desc && av.desc !== hoje && seq(S.treinos).atual >= 4) { av.desc = hoje; notificar('Descanso', 'Você treinou vários dias seguidos. Considere recuperar hoje.'); salvar(); }
}

/* ---------- Rede, instalação e offline ---------- */
function rede() { var c = $('#chipRede'), on = navigator.onLine; c.dataset.estado = on ? 'online' : 'offline'; c.textContent = on ? 'Online' : 'Offline'; }
window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); promptInst = e; if (tab === 'perfil') render(); });
window.addEventListener('appinstalled', function () { promptInst = null; });
function registrarSW() {
  if (!('serviceWorker' in navigator)) return;
  var mostrar = function (w) { $('#avisoAtualizacao').hidden = false; $('#btnAtualizar').onclick = function () { w.postMessage('PULAR_ESPERA'); }; };
  navigator.serviceWorker.register('sw.js').then(function (reg) {
    if (reg.waiting && navigator.serviceWorker.controller) mostrar(reg.waiting);
    reg.addEventListener('updatefound', function () { var n = reg.installing; if (n) n.addEventListener('statechange', function () { if (n.state === 'installed' && navigator.serviceWorker.controller) mostrar(n); }); });
  }).catch(function () { });
  var rec = false, tinha = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', function () { if (!tinha) { tinha = true; return; } if (rec) return; rec = true; location.reload(); });
}

/* ---------- Início ---------- */
function iniciar() {
  rede(); window.addEventListener('online', rede); window.addEventListener('offline', rede); registrarSW();
  window.addEventListener('beforeunload', persist); document.addEventListener('visibilitychange', function () { if (document.hidden) persist(); });
  Promise.all([kvGet('estado'), kvGet('ativo')]).then(function (r) {
    if (r[0]) S = Object.assign(S, r[0]);
    if (r[1] && r[1].acc > 5) ativoSalvo = r[1];
    $('#app').hidden = false; render(); lembretes(); setInterval(lembretes, 30000);
    var sp = $('#splash'); setTimeout(function () { sp.classList.add('saindo'); setTimeout(function () { sp.remove(); }, 600); }, 1100);
  });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
