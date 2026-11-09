// ============================================================================
// FILE: youtube-dom-extractor.js
// KIẾN TRÚC THỐNG NHẤT (UNIFIED ARCHITECTURE) - SINGLE SOURCE OF TRUTH
// Xử lý Phát Video MP4 Trực Tiếp, Phân Giải Stream YouTube, Đồng Bộ 3D & IFrame Fallback
// ============================================================================

export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function parseDurationToSeconds(durStr) {
  if (!durStr) return 0;
  const parts = String(durStr).split(':').map(Number);
  if (parts.length === 3) return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  if (parts.length === 2) return (parts[0] || 0) * 60 + (parts[1] || 0);
  return Number(durStr) || 0;
}

// ============================================================================
// 1. QUẢN LÝ TRẠNG THÁI TOÀN CỤC & TÁP-LÔ 3D DIGITAL TWIN
// ============================================================================
export const PlayerState = {
  IDLE: 'idle',
  SEARCHING: 'searching',
  RESOLVING: 'resolving',
  LOADING: 'loading',
  PLAYING: 'playing',
  PAUSED: 'paused',
  FALLBACK: 'fallback',
  ERROR: 'error'
};

let currentRequestId = 0;
let currentPlayerState = PlayerState.IDLE;
let currentMediaItem = null;

// Khởi tạo các biến chia sẻ cho app.js vẽ màn hình táp-lô 3D
window.currentYtCoverImage = new Image();
window.currentYtCoverImage.crossOrigin = 'Anonymous';
window.currentYtCoverImage.onerror = () => {
  if (window.currentYtVideoId && !window.currentYtCoverImage.src.includes('direct_fallback')) {
    window.currentYtCoverImage.src = `https://i.ytimg.com/vi/${window.currentYtVideoId}/hqdefault.jpg?direct_fallback=1`;
  }
};
window.currentYtDurationText = 'LIVE / FULL';
window.currentYtStartTime = performance.now();
window.currentYtVideoId = '';
window.currentYtQueue = [];

// ============================================================================
// 2. LOGGING TRỰC QUAN TRÊN GIAO DIỆN MODAL YOUTUBE
// ============================================================================
function getDomInspectorLogEl() {
  let el = document.getElementById('yt-f12-dom-log');
  const playlistSide = document.querySelector('#youtube-app-modal .yt-playlist-side');
  if (!el && playlistSide) {
    el = document.createElement('div');
    el.id = 'yt-f12-dom-log';
    el.style.cssText =
      'background:#0a1520;border:1px solid #00e5ff;color:#00ff88;font-family:monospace;font-size:10.5px;padding:6px 8px;border-radius:6px;margin-bottom:6px;line-height:1.35;';
    el.innerHTML = '🛠 <b>[YouTube Engine]:</b> Sẵn sàng phát Video MP4 & YouTube Stream.';
    playlistSide.prepend(el);
  }
  return el;
}

export function logStatus(msg, color = '#00ff88') {
  const el = getDomInspectorLogEl();
  if (el) {
    el.style.color = color;
    el.innerHTML = `🛠 <b>[YT Engine]:</b> ${msg}`;
  }
}

// ============================================================================
// 3. ĐỒNG BỘ TRẠNG THÁI ĐA MÀN HÌNH (WEBSOCKET & SUPABASE)
// ============================================================================
export async function broadcastYouTubeSyncState(videoPayload) {
  try {
    await fetch('/api/yt-sync-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(videoPayload)
    });
  } catch (e) {}

  window.dispatchEvent(new CustomEvent('yt-multiscreen-sync', { detail: videoPayload }));

  if (window.supabaseChannel) {
    try {
      window.supabaseChannel.send({
        type: 'broadcast',
        event: 'YT_MULTISCREEN_SYNC',
        payload: videoPayload
      });
    } catch (e) {}
  }
}

// ============================================================================
// 4. LUỒNG PHÁT MEDIA DUY NHẤT CÓ THẨM QUYỀN (AUTHORITATIVE PLAYBACK)
// ============================================================================
export async function playMediaItem(item, seatIdx = 0) {
  if (!item) return;

  const reqId = ++currentRequestId;
  currentPlayerState = PlayerState.RESOLVING;

  const title = item.title || 'YouTube Video';
  let vid = (item.videoId || '').trim();
  let directUrl = (item.directUrl || '').trim();
  const durText = item.duration || 'Full HD';

  // Nhận diện nếu directUrl là URL YouTube
  if (!vid && directUrl) {
    const ytMatch = directUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch) {
      vid = ytMatch[1];
      directUrl = '';
    }
  }

  // Cập nhật trạng thái hiển thị táp-lô 3D
  window.currentYtVideoId = vid;
  window.currentYtDurationText = durText;
  window.currentYtStartTime = performance.now();
  currentMediaItem = { ...item, videoId: vid, directUrl, title };

  window.dispatchEvent(new CustomEvent('yt-title-updated', { detail: title }));

  // Cập nhật ảnh bìa Thumbnail HD
  if (window.currentYtCoverImage) {
    if (vid) {
      window.currentYtCoverImage.src = `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
    } else if (item.thumbnail) {
      window.currentYtCoverImage.src = item.thumbnail;
    }
  }

  const videoEl = document.getElementById('yt-html5-player');
  const iframeEl = document.getElementById('yt-iframe');
  if (!videoEl || !iframeEl) return;

  // --------------------------------------------------------------------------
  // NHÁNH 1: URL Video Trực Tiếp (.mp4 / .webm)
  // --------------------------------------------------------------------------
  if (directUrl && !vid) {
    currentPlayerState = PlayerState.LOADING;
    logStatus(`🎬 Đang tải luồng MP4 trực tiếp: <b>${escapeHtml(title.slice(0, 36))}</b>`);

    iframeEl.src = 'about:blank';
    iframeEl.classList.add('panel-hidden');
    iframeEl.style.display = 'none';

    videoEl.classList.remove('panel-hidden');
    videoEl.style.display = 'block';
    videoEl.setAttribute('playsinline', 'true');
    videoEl.removeAttribute('crossorigin');
    videoEl.crossOrigin = 'anonymous';
    videoEl.src = directUrl;
    videoEl.muted = false;

    videoEl.onerror = () => {
      if (reqId !== currentRequestId) return;
      currentPlayerState = PlayerState.ERROR;
      logStatus(`❌ Lỗi tải URL media: ${escapeHtml(directUrl.slice(0, 42))}...`, '#ff3b30');
    };

    try {
      await videoEl.play();
      if (reqId === currentRequestId) {
        currentPlayerState = PlayerState.PLAYING;
        logStatus(`▶ Đang phát MP4: <b>${escapeHtml(title.slice(0, 36))}</b>`, '#00ff88');
      }
    } catch (playErr) {
      videoEl.muted = true;
      try {
        await videoEl.play();
        const unmuteOnce = () => {
          videoEl.muted = false;
          window.removeEventListener('pointerdown', unmuteOnce);
        };
        window.addEventListener('pointerdown', unmuteOnce, { once: true });
      } catch (e) {}
    }

    broadcastYouTubeSyncState({
      videoId: 'direct_mp4',
      title,
      streamUrl: directUrl,
      durationText: durText,
      durationSeconds: parseDurationToSeconds(durText),
      currentTime: 0,
      isPlaying: true,
      updatedBySeat: seatIdx
    });
    return;
  }

  // --------------------------------------------------------------------------
  // NHÁNH 2: Video YouTube (videoId)
  // --------------------------------------------------------------------------
  if (vid) {
    logStatus(`🔍 Đang phân giải luồng YouTube: <b>${escapeHtml(title.slice(0, 32))}</b>...`, '#ffd60a');

    // Thử lấy luồng MP4 trực tiếp từ server
    let streamResolved = null;
    try {
      const res = await fetch(`/api/yt-dom-stream?videoId=${encodeURIComponent(vid)}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.streamUrl) {
          streamResolved = `/api/yt-stream-proxy?url=${encodeURIComponent(data.streamUrl)}`;
        }
      }
    } catch (e) {}

    if (reqId !== currentRequestId) return;

    let html5PlaySuccess = false;
    if (streamResolved) {
      currentPlayerState = PlayerState.LOADING;
      iframeEl.src = 'about:blank';
      iframeEl.classList.add('panel-hidden');
      iframeEl.style.display = 'none';

      videoEl.classList.remove('panel-hidden');
      videoEl.style.display = 'block';
      videoEl.setAttribute('playsinline', 'true');
      videoEl.removeAttribute('crossorigin');
      videoEl.crossOrigin = 'anonymous';

      const playPromise = new Promise((resolve) => {
        let settled = false;
        videoEl.onerror = () => {
          if (!settled) { settled = true; resolve(false); }
        };
        videoEl.onplaying = () => {
          if (!settled) { settled = true; resolve(true); }
        };
        videoEl.src = streamResolved;
        videoEl.muted = false;
        videoEl.play().catch(() => {
          videoEl.muted = true;
          videoEl.play().catch(() => {
            if (!settled) { settled = true; resolve(false); }
          });
        });
        setTimeout(() => {
          if (!settled) { settled = true; resolve(!videoEl.paused); }
        }, 4000);
      });

      html5PlaySuccess = await playPromise;
    }

    if (reqId !== currentRequestId) return;

    // Nếu MP4 trực tiếp chạy thành công -> Hoàn tất
    if (html5PlaySuccess) {
      currentPlayerState = PlayerState.PLAYING;
      logStatus(`✅ Đang phát MP4 gốc Full thời lượng (${durText}): <b>${escapeHtml(title.slice(0, 32))}</b>`, '#00ff88');

      broadcastYouTubeSyncState({
        videoId: vid,
        title,
        streamUrl: streamResolved,
        durationText: durText,
        durationSeconds: parseDurationToSeconds(durText),
        currentTime: 0,
        isPlaying: true,
        updatedBySeat: seatIdx
      });
      return;
    }

    // Nếu MP4 không khả dụng (YouTube DRM/Cipher chặn IP) -> Chuyển sang IFrame YouTube chính thức
    // Màn hình táp-lô 3D tự động hiển thị HD Thumbnail thật + sóng nhạc sống động + timer
    currentPlayerState = PlayerState.FALLBACK;
    logStatus(`▶ Đang phát qua YouTube Embed (${durText}): <b>${escapeHtml(title.slice(0, 32))}</b> <a href="https://www.youtube.com/watch?v=${vid}" target="_blank" style="color:#00e5ff;text-decoration:underline;margin-left:6px;">[Mở trên YouTube ↗]</a>`, '#00ff88');

    videoEl.pause();
    videoEl.classList.add('panel-hidden');
    videoEl.style.display = 'none';

    iframeEl.classList.remove('panel-hidden');
    iframeEl.style.display = 'block';
    iframeEl.removeAttribute('sandbox');
    iframeEl.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    iframeEl.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
    iframeEl.setAttribute('allowfullscreen', 'true');
    const isHttpOrigin = typeof window !== 'undefined' && window.location.origin && (window.location.origin.startsWith('http://') || window.location.origin.startsWith('https://'));
    const originParam = isHttpOrigin ? `&origin=${encodeURIComponent(window.location.origin)}` : '';
    iframeEl.src = `https://www.youtube.com/embed/${vid}?autoplay=1&playsinline=1&rel=0&enablejsapi=1${originParam}`;

    broadcastYouTubeSyncState({
      videoId: vid,
      title,
      streamUrl: `https://www.youtube.com/watch?v=${vid}`,
      durationText: durText,
      durationSeconds: parseDurationToSeconds(durText),
      currentTime: 0,
      isPlaying: true,
      updatedBySeat: seatIdx
    });
  }
}

// ============================================================================
// 5. LUỒNG TÌM KIẾM YOUTUBE DUY NHẤT CÓ THẨM QUYỀN (AUTHORITATIVE SEARCH)
// ============================================================================
export async function searchYouTube(rawQuery, seatIdx = 0) {
  const query = (rawQuery || '').trim();
  if (!query) return;

  const reqId = ++currentRequestId;
  currentPlayerState = PlayerState.SEARCHING;

  // Kiểm tra nếu là URL YouTube dán vào ô tìm kiếm
  const ytMatch = query.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) {
    await playMediaItem({
      videoId: ytMatch[1],
      title: `YouTube (${ytMatch[1]})`,
      duration: 'Full HD'
    }, seatIdx);
    return;
  }

  // Kiểm tra nếu là URL MP4/WebM trực tiếp
  if (/^https?:\/\/.+\.(mp4|webm|m4v|mov)(\?.*)?$/i.test(query)) {
    const filename = query.split('/').pop().split('?')[0] || 'Direct MP4 Video';
    await playMediaItem({
      title: decodeURIComponent(filename),
      directUrl: query,
      duration: 'Direct Stream'
    }, seatIdx);
    return;
  }

  logStatus(`🔍 Đang tìm kiếm video: "<b>${escapeHtml(query)}</b>"...`, '#ffd60a');

  let items = [];
  try {
    const res = await fetch(`/api/yt-search?q=${encodeURIComponent(query)}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.items) && data.items.length > 0) {
        items = data.items;
      }
    }
  } catch (e) {}

  if (reqId !== currentRequestId) return;

  // Dự phòng Invidious công cộng nếu API nội bộ gặp sự cố mạng
  if (items.length === 0) {
    const invidiousApis = [
      `https://inv.tux.pizza/api/v1/search?q=${encodeURIComponent(query)}&type=video`,
      `https://invidious.nerdvpn.de/api/v1/search?q=${encodeURIComponent(query)}&type=video`
    ];
    for (const api of invidiousApis) {
      try {
        const r = await fetch(api, { signal: AbortSignal.timeout(4000) });
        if (r.ok) {
          const arr = await r.json();
          if (Array.isArray(arr) && arr.length > 0) {
            items = arr.filter((x) => x.videoId).slice(0, 15).map((x) => ({
              videoId: x.videoId,
              title: x.title || query,
              duration: x.lengthSeconds ? `${Math.floor(x.lengthSeconds / 60)}:${String(x.lengthSeconds % 60).padStart(2, '0')}` : 'Full HD',
              thumbnail: `https://i.ytimg.com/vi/${x.videoId}/mqdefault.jpg`
            }));
            break;
          }
        }
      } catch (e) {}
    }
  }

  if (reqId !== currentRequestId) return;

  const playlistSide = document.querySelector('#youtube-app-modal .yt-playlist-side');

  if (items.length === 0) {
    logStatus(`⚠ Không tìm thấy video nào cho: "<b>${escapeHtml(query)}</b>". Hãy thử từ khóa khác.`, '#ff3b30');
    if (playlistSide) {
      playlistSide.querySelectorAll('.yt-card').forEach((c) => c.remove());
      const emptyCard = document.createElement('div');
      emptyCard.className = 'yt-card';
      emptyCard.style.cssText = 'padding:12px;background:rgba(255,59,48,0.12);border:1px solid #ff3b30;border-radius:6px;color:#fff;';
      emptyCard.innerHTML = `
        <b style="color:#ff3b30;">⚠ Không có kết quả tìm kiếm</b>
        <div style="font-size:11px;margin-top:4px;color:#ccc;">Vui lòng kiểm tra kết nối mạng hoặc thử tìm với từ khóa khác (ví dụ: tên bài hát hoặc dán link YouTube trực tiếp).</div>
      `;
      playlistSide.appendChild(emptyCard);
    }
    return;
  }

  window.currentYtQueue = items;

  // Cập nhật danh sách phát trên giao diện
  if (playlistSide) {
    playlistSide.querySelectorAll('.yt-card').forEach((c) => c.remove());

    items.forEach((item, idx) => {
      const card = document.createElement('div');
      card.className = `yt-card ${idx === 0 ? 'active' : ''}`;
      card.innerHTML = `
        <div style="display:flex;gap:8px;align-items:center;">
          <div style="position:relative;width:72px;height:44px;flex-shrink:0;">
            <img src="${escapeHtml(item.thumbnail)}" style="width:72px;height:44px;object-fit:cover;border-radius:4px;border:1px solid #ff0000;" />
            <span style="position:absolute;bottom:2px;right:2px;background:rgba(0,0,0,0.85);color:#ffd60a;font-size:9px;padding:1px 3px;border-radius:3px;font-weight:bold;">${escapeHtml(item.duration || 'Full')}</span>
          </div>
          <div style="flex:1;overflow:hidden;">
            <b style="font-size:11px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${idx + 1}. ${escapeHtml(item.title)}</b>
            <span style="color:#00ff88;font-size:10px;">▶ Thời lượng: ${escapeHtml(item.duration || 'Full HD')}</span>
          </div>
        </div>
      `;
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        playlistSide.querySelectorAll('.yt-card').forEach((c) => c.classList.remove('active'));
        card.classList.add('active');
        playMediaItem(item, seatIdx);
      });
      playlistSide.appendChild(card);
    });
  }

  logStatus(`✅ Đã tìm thấy <b>${items.length} video</b>. Đang phát: <b>${escapeHtml(items[0].title.slice(0, 30))}</b>`, '#00ff88');
  await playMediaItem(items[0], seatIdx);
}

// ============================================================================
// Lắng nghe thông điệp lỗi trực tiếp từ YouTube IFrame Player API (Error 2, 5, 100, 101, 150, 153)
if (typeof window !== 'undefined' && !window._ytMessageHookBound) {
  window._ytMessageHookBound = true;
  window.addEventListener('message', (event) => {
    if (!event.origin || (!event.origin.includes('youtube.com') && !event.origin.includes('youtube-nocookie.com'))) return;
    try {
      const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      if (data && data.event === 'onError') {
        const errCode = Number(data.info);
        const errMap = {
          2: 'Tham số video ID không hợp lệ',
          5: 'Lỗi trình phát HTML5 YouTube trong iframe',
          100: 'Video không tồn tại hoặc đã bị xóa / đặt riêng tư',
          101: 'Chủ sở hữu video không cho phép nhúng trên trang khác (Error 101)',
          150: 'Chủ sở hữu video không cho phép nhúng (Error 150)',
          153: 'YouTube chặn nhúng do thiếu Referer / Origin hợp lệ (Error 153)'
        };
        const msg = errMap[errCode] || `Mã lỗi IFrame: ${errCode}`;
        const currVid = window.currentYtVideoId || '';
        logStatus(`⚠ YouTube IFrame Player báo lỗi: <b>${msg}</b> ${currVid ? `<a href="https://www.youtube.com/watch?v=${currVid}" target="_blank" style="color:#00e5ff;text-decoration:underline;margin-left:6px;">[Mở trên YouTube ↗]</a>` : ''}`, '#ff3b30');
      }
    } catch (e) {}
  });
}

// 6. GẮN SỰ KIỆN DUY NHẤT CHO GIAO DIỆN MODAL (SINGLE EVENT BINDING)
// ============================================================================
function bindDefaultCards() {
  const cards = document.querySelectorAll('#youtube-app-modal .yt-playlist-side .yt-card');
  cards.forEach((card) => {
    if (card.dataset.unifiedBound) return;
    card.dataset.unifiedBound = '1';
    card.addEventListener('click', (e) => {
      e.stopPropagation();
      cards.forEach((c) => c.classList.remove('active'));
      card.classList.add('active');

      const type = card.getAttribute('data-type');
      const src = card.getAttribute('data-src') || '';
      const title = card.getAttribute('data-title') || 'Media';

      if (type === 'iframe') {
        const match = src.match(/(?:embed\/)([a-zA-Z0-9_-]{11})/);
        if (match) {
          playMediaItem({ videoId: match[1], title });
        } else {
          playMediaItem({ directUrl: src, title });
        }
      } else {
        playMediaItem({ directUrl: src, title });
      }
    });
  });
}

export function initYouTubeControls() {
  const inputEl = document.getElementById('yt-custom-input');
  const btnSearch = document.getElementById('btn-yt-load-url');

  if (btnSearch && !btnSearch.dataset.unifiedBound) {
    btnSearch.dataset.unifiedBound = '1';
    btnSearch.addEventListener('click', (e) => {
      e.preventDefault();
      searchYouTube(inputEl ? inputEl.value : '');
    });
  }

  if (inputEl && !inputEl.dataset.unifiedBound) {
    inputEl.dataset.unifiedBound = '1';
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        searchYouTube(inputEl.value);
      }
    });
  }

  bindDefaultCards();
}

// Khởi tạo điều khiển ngay khi DOM sẵn sàng
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initYouTubeControls);
} else {
  setTimeout(initYouTubeControls, 60);
}

// ============================================================================
// 7. CÁC HÀM TƯƠNG THÍCH TOÀN CỤC (BACKWARD COMPATIBILITY ADAPTERS)
// ============================================================================
export async function playExtractedVideoUrlInFrame(videoItem) {
  return playMediaItem(videoItem);
}

window.playExtractedVideoUrlInFrame = playExtractedVideoUrlInFrame;
window.playMediaItem = playMediaItem;
window.searchYouTube = searchYouTube;
window.triggerUnifiedYouTubeSearch = searchYouTube;
window.playGuaranteedMp4OnHtml5Player = playMediaItem;
window.searchYouTubeMp4Universal = searchYouTube;
window.playQueueItemAtIndex = function(idx) {
  if (window.currentYtQueue && window.currentYtQueue[idx]) {
    return playMediaItem(window.currentYtQueue[idx]);
  }
};
window.broadcastYouTubeSyncState = broadcastYouTubeSyncState;
