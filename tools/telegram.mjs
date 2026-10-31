#!/usr/bin/env node
// Telegram-Bot, über den Claude dem Nutzer Updates und Fragen schickt.
// Zugangsdaten liegen außerhalb des Repos: ~/.config/game01/telegram.env
//   TELEGRAM_BOT_TOKEN=...   (von @BotFather)
//   TELEGRAM_CHAT_ID=...     (trägt `setup` selbst ein)
//
// Befehle:
//   setup [--wait s]              Chat-ID aus der letzten Nachricht an den Bot ermitteln
//   send <text>                   Textnachricht (Markdown-frei, damit nichts falsch formatiert)
//   photo <datei> [beschriftung]  Bild senden (z. B. Screenshot)
//   ask <frage> <option>...       Frage mit Knöpfen; wartet (max. --wait Sekunden, Standard 0) auf die Antwort
//   inbox [--wait s]              Neue Nachrichten/Knopfdrücke des Nutzers ausgeben
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename } from 'node:path';

const DIR = join(homedir(), '.config', 'game01');
const ENV = join(DIR, 'telegram.env');
const OFFSET = join(DIR, 'telegram.offset');

function loadEnv() {
  if (!existsSync(ENV)) fail(`Fehlt: ${ENV} (TELEGRAM_BOT_TOKEN=... eintragen)`);
  const env = {};
  for (const line of readFileSync(ENV, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2];
  }
  if (!env.TELEGRAM_BOT_TOKEN) fail('TELEGRAM_BOT_TOKEN fehlt in ' + ENV);
  return env;
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

async function api(token, method, body) {
  const opts = { method: 'POST' };
  if (body instanceof FormData) opts.body = body;
  else if (body) {
    opts.headers = { 'content-type': 'application/json' };
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, opts);
  const json = await res.json();
  if (!json.ok) fail(`Telegram ${method}: ${json.description}`);
  return json.result;
}

function readOffset() {
  return existsSync(OFFSET) ? Number(readFileSync(OFFSET, 'utf8')) || 0 : 0;
}

/** Holt neue Updates (long polling bis `wait` s) und merkt sich den Stand. */
async function poll(token, wait = 0) {
  const updates = await api(token, 'getUpdates', { offset: readOffset(), timeout: wait });
  if (updates.length) writeFileSync(OFFSET, String(updates.at(-1).update_id + 1));
  return updates;
}

function describe(u) {
  if (u.callback_query) return { chat: u.callback_query.message?.chat.id, text: `[Knopf] ${u.callback_query.data}`, cb: u.callback_query.id };
  const m = u.message ?? u.edited_message;
  if (!m) return null;
  return { chat: m.chat.id, text: m.text ?? m.caption ?? '[Anhang]' };
}

function waitArg(args) {
  const i = args.indexOf('--wait');
  if (i < 0) return 0;
  const s = Number(args[i + 1]) || 0;
  args.splice(i, 2);
  return s;
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const env = loadEnv();
  const token = env.TELEGRAM_BOT_TOKEN;
  const needChat = () => env.TELEGRAM_CHAT_ID || fail('Erst `setup` ausführen (Chat-ID fehlt).');

  switch (cmd) {
    case 'setup': {
      const deadline = Date.now() + waitArg(args) * 1000;
      let updates = await api(token, 'getUpdates', { timeout: 0 });
      while (!updates.length && Date.now() < deadline) {
        updates = await api(token, 'getUpdates', { timeout: Math.min(50, Math.ceil((deadline - Date.now()) / 1000)) });
      }
      const last = updates.map(describe).filter(Boolean).at(-1);
      if (!last) fail('Keine Nachricht gefunden – bitte dem Bot erst „/start“ schreiben.');
      mkdirSync(DIR, { recursive: true });
      const lines = readFileSync(ENV, 'utf8').split('\n').filter((l) => l && !l.startsWith('TELEGRAM_CHAT_ID='));
      lines.push(`TELEGRAM_CHAT_ID=${last.chat}`);
      writeFileSync(ENV, lines.join('\n') + '\n', { mode: 0o600 });
      if (updates.length) writeFileSync(OFFSET, String(updates.at(-1).update_id + 1));
      await api(token, 'sendMessage', { chat_id: last.chat, text: 'Verbunden. Hier kommen ab jetzt Updates zu Splitterwelten.' });
      console.log('Chat-ID gespeichert.');
      break;
    }
    case 'send': {
      if (!args.length) fail('Text fehlt.');
      await api(token, 'sendMessage', { chat_id: needChat(), text: args.join(' ') });
      console.log('gesendet');
      break;
    }
    case 'photo': {
      const [file, ...caption] = args;
      if (!file) fail('Datei fehlt.');
      const form = new FormData();
      form.append('chat_id', needChat());
      if (caption.length) form.append('caption', caption.join(' '));
      form.append('photo', new Blob([readFileSync(file)]), basename(file));
      await api(token, 'sendPhoto', form);
      console.log('gesendet');
      break;
    }
    case 'ask': {
      const wait = waitArg(args);
      const [question, ...options] = args;
      if (!question) fail('Frage fehlt.');
      const chat = needChat();
      await poll(token); // alte Nachrichten überspringen, damit nur die neue Antwort zählt
      await api(token, 'sendMessage', {
        chat_id: chat,
        text: question,
        reply_markup: options.length
          ? { inline_keyboard: options.map((o) => [{ text: o, callback_data: o.slice(0, 64) }]) }
          : undefined,
      });
      if (!wait) {
        console.log('Frage gesendet; Antwort später mit `inbox` abholen.');
        break;
      }
      const deadline = Date.now() + wait * 1000;
      while (Date.now() < deadline) {
        const left = Math.max(1, Math.min(50, Math.round((deadline - Date.now()) / 1000)));
        for (const u of await poll(token, left)) {
          const d = describe(u);
          if (!d || String(d.chat) !== String(chat)) continue;
          if (d.cb) await api(token, 'answerCallbackQuery', { callback_query_id: d.cb, text: 'Danke!' });
          console.log(d.text);
          return;
        }
      }
      console.log('(keine Antwort innerhalb der Wartezeit)');
      break;
    }
    case 'inbox': {
      const chat = needChat();
      const wait = waitArg(args);
      const msgs = [];
      for (const u of await poll(token, wait)) {
        const d = describe(u);
        if (!d || String(d.chat) !== String(chat)) continue;
        if (d.cb) await api(token, 'answerCallbackQuery', { callback_query_id: d.cb, text: 'Danke!' });
        msgs.push(d.text);
      }
      console.log(msgs.length ? msgs.join('\n') : '(keine neuen Nachrichten)');
      break;
    }
    default:
      fail('Befehle: setup | send <text> | photo <datei> [text] | ask <frage> <optionen…> [--wait s] | inbox [--wait s]');
  }
}

main();
