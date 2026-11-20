'use strict';

/** Direct YouTube MP4 resolution with yt-dlp and Innertube fallback. */

const https = require('node:https');

const { execFile } = require('node:child_process');
const YT_VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

async function tryResolveYtDlpStream(videoId, timeout = 12000) {
  if (typeof videoId !== 'string' || !YT_VIDEO_ID_RE.test(videoId)) return null;
  try {
    const stdout = await new Promise((resolve, reject) => {
      execFile('yt-dlp', [
        '-f', 'bv*[ext=mp4][height<=720]+ba[ext=m4a]/b[ext=mp4]/b',
        '-g', '--no-warnings', '--', 'https://youtube.com/watch?v=' + videoId
      ], { shell: false, timeout, maxBuffer: 1024 * 1024 }, (err, output) => {
        if (err) reject(err);
        else resolve(output);
      });
    });
    const url = stdout.trim().split(/\r?\n/, 1)[0];
    if (/^https?:\/\//.test(url)) return url;
  } catch {}
  return null;
}

async function resolveDirectMp4FromVideoId(videoId) {
  if (typeof videoId !== 'string' || !YT_VIDEO_ID_RE.test(videoId)) return null;
  const directUrl = await tryResolveYtDlpStream(videoId, 15000);
  if (directUrl) return directUrl;
  return new Promise((resolve) => {
    try {
      const postData = JSON.stringify({
        context: {
          client: {
            clientName: 'ANDROID_VR',
            clientVersion: '1.56.21',
            androidSdkVersion: 32,
            hl: 'vi',
            gl: 'VN'
          }
        },
        videoId,
        contentCheckOk: true,
        racyCheckOk: true
      });

      const options = {
        hostname: 'www.youtube.com',
        path: '/youtubei/v1/player?prettyPrint=false',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'User-Agent': 'com.google.android.apps.youtube.vr.oculus/1.56.21 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip'
        },
        timeout: 6000
      };

      const req = https.request(options, (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
          try {
            const json = JSON.parse(raw);
            const formats = (json.streamingData && json.streamingData.formats) || [];
            const mp4 = formats.find((f) => f.url && (f.itag === 18 || f.itag === 22)) ||
                        formats.find((f) => f.url && f.mimeType && f.mimeType.includes('video/mp4')) ||
                        formats[0];
            if (mp4 && mp4.url) return resolve(mp4.url);
          } catch (e) {}
          resolve(null);
        });
      });

      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.write(postData);
      req.end();
    } catch (err) {
      resolve(null);
    }
  });
}

module.exports = { YT_VIDEO_ID_RE, tryResolveYtDlpStream, resolveDirectMp4FromVideoId };
