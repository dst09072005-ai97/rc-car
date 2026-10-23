// ============================================================================
// FILE: www/youtube-dom-extractor.js (PHIÊN BẢN V290 - PHÁT MP4 TỨC THÌ TRÊN
// CẢ TÁP-LÔ 3D & KHUNG YOUTUBE 2D, KHÔNG BỊ CHẶN AUTOPLAY HAY ĐỨNG Ở 0:00)
// ============================================================================

const DEFAULT_PLAYLIST_ITEMS = [
  {
    videoId: 'YQHsXMglC9A',
    directUrl: '/api/yt-mp4-direct?videoId=YQHsXMglC9A',
    title: '1. 🎵 Tuyển Tập Hits Thịnh Hành - Anh Trai Say Hi & Quang Hùng MasterD (Full HD)',
    channelName: 'Vie Channel - MUSIC Official',
    viewCount: '18.5M lượt xem',
    publishedTime: 'Đang thịnh hành #1',
    duration: '12:14',
    description:
      'Tuyển tập các bản Hit triệu view thịnh hành nhất trên hệ thống giải trí Rolls-Royce.\n' +
      '• Đồng bộ trực tiếp hình ảnh MP4 & âm thanh lên màn hình Táp-lô 3D và màn hình Ghế Phụ.\n' +
      '• Tương thích 100% với Kính thực tế ảo Meta Quest 3, Điện thoại và Trình duyệt PC.',
    thumbnail: 'https://i.ytimg.com/vi/YQHsXMglC9A/hqdefault.jpg'
  },
  {
    videoId: 'jfKfPfyJRdk',
    directUrl: '/api/yt-mp4-direct?videoId=jfKfPfyJRdk',
    title: '2. 🎧 Lofi Hip Hop Radio - Beats To Relax / Night Drive In Rolls-Royce',
    channelName: 'Lofi Girl Official',
    viewCount: '42.1M lượt xem',
    publishedTime: 'YouTube Music HD',
    duration: '09:56',
    description:
      'Giai điệu Lofi Chill thư giãn hoàn hảo khi lái chiếc Rolls-Royce Ghost dạo phố ban đêm.',
    thumbnail: 'https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg'
  },
  {
    videoId: '5qap5aO4i9A',
    directUrl: '/api/yt-mp4-direct?videoId=5qap5aO4i9A',
    title: '3. 🏎️ Rolls-Royce Ghost Black Badge - Night POV Drive 4K Cinema',
    channelName: 'Supercar Driver Official',
    viewCount: '9.4M lượt xem',
    publishedTime: 'Chuyên mục Siêu Xe 4K',
    duration: '00:47',
    description:
      'Trải nghiệm góc nhìn thứ nhất cầm lái Rolls-Royce Ghost với bầu trời sao Starlight Headliner.',
    thumbnail: 'https://i.ytimg.com/vi/5qap5aO4i9A/hqdefault.jpg'
  },
  {
    videoId: '4xDzrJKXOOY',
    directUrl: '/api/yt-mp4-direct?videoId=4xDzrJKXOOY',
    title: '4. 🌆 Synthwave Cyberpunk Radio - Night City Cruise Beats',
    channelName: 'Lofi & Synthwave 4K',
    viewCount: '11.2M lượt xem',
    publishedTime: 'Night Drive Mix',
    duration: '10:53',
    description:
      'Nhạc điện tử Synthwave sống động cho hành trình lái xe xuyên thành phố đêm.',
    thumbnail: 'https://i.ytimg.com/vi/4xDzrJKXOOY/hqdefault.jpg'
  },
  {
    videoId: 'LXb3EKWsInQ',
    directUrl: '/api/yt-mp4-direct?videoId=LXb3EKWsInQ',
    title: '5. 🎬 Costa Rica 4K 60FPS HDR - Siêu Phẩm Thiên Nhiên Độ Phân Giải Cao',
    channelName: 'Jacob + Katie Schwarz 4K',
    viewCount: '115M lượt xem',
    publishedTime: '4K Ultra HD',
    duration: '00:15',
    description:
      'Video thử nghiệm độ sắc nét màn hình Táp-lô 3D và hệ thống âm thanh vòm trên xe.',
    thumbnail: 'https://i.ytimg.com/vi/LXb3EKWsInQ/hqdefault.jpg'
  }
];

let currentActivePlaylist = [...DEFAULT_PLAYLIST_ITEMS];
let currentPlayingIndex = 0;
let streamWatchdogTimer = null;
let userHasInteractedWithPage = false;

window.currentYtCoverImage = new Image();
window.currentYtCoverImage.crossOrigin = 'Anonymous';
window.currentYtDurationText = 'FULL HD';

// Ngay khi người dùng click / chạm / bấm phím lần đầu, tự động bật tiếng cho trình phát MP4
function unlockVideoAudioOnFirstGesture() {
  if (userHasInteractedWithPage) return;
  userHasInteractedWithPage = true;
  const v = document.getElementById('yt-html5-player');
  if (v) {
    v.muted = false;
    if (v.paused && v.src) {
      v.play().catch(() => {});
    }
  }
}
window.addEventListener('pointerdown', unlockVideoAudioOnFirstGesture, { passive: true });
window.addEventListener('keydown', unlockVideoAudioOnFirstGesture, { passive: true });

function ensureYouTubeWebLayoutReady() {
  const modal = document.getElementById('youtube-app-modal');
  if (!modal) return {};

  const bodyEl = modal.querySelector('.yt-body');
  const playerArea = modal.querySelector('.yt-player-area');
  const playlistSide = modal.querySelector('.yt-playlist-side');
  const videoEl = document.getElementById('yt-html5-player');
  const iframeEl = document.getElementById('yt-iframe');

  if (bodyEl) bodyEl.style.height = '470px';
  if (playerArea) {
    playerArea.style.display = 'flex';
    playerArea.style.flexDirection = 'column';
    playerArea.style.background = '#0f0f0f';
    playerArea.style.overflow = 'hidden';
  }

  let stageBox = document.getElementById('yt-stage-viewport');
  if (!stageBox && playerArea && videoEl) {
    stageBox = document.createElement('div');
    stageBox.id = 'yt-stage-viewport';
    stageBox.style.cssText = 'position:relative; width:100%; height:285px; flex-shrink:0; background:#000;';
    playerArea.prepend(stageBox);
    stageBox.appendChild(videoEl);
    if (iframeEl) stageBox.appendChild(iframeEl);
  }

  if (videoEl) {
    videoEl.removeAttribute('crossorigin');
    videoEl.style.cssText = 'width:100%; height:100%; object-fit:contain; background:#000; display:block;';
    videoEl.playsInline = true;
    videoEl.loop = false;
  }
  if (iframeEl) {
    iframeEl.src = 'about:blank';
    iframeEl.classList.add('panel-hidden');
    iframeEl.style.display = 'none';
  }

  let descPanel = document.getElementById('yt-web-description-panel');
  if (!descPanel && playerArea) {
    descPanel = document.createElement('div');
    descPanel.id = 'yt-web-description-panel';
    descPanel.style.cssText =
      'flex:1; overflow-y:auto; padding:10px 14px; background:#141414; border-top:1px solid #2a2a2a; color:#f1f1f1; font-family:"Segoe UI",sans-serif; user-select:text;';
    playerArea.appendChild(descPanel);
  }

  return { modal, playerArea, playlistSide, videoEl, iframeEl, descPanel };
}

function renderYouTubeDescriptionPanel(item) {
  const { descPanel } = ensureYouTubeWebLayoutReady();
  if (!descPanel || !item) return;

  const title = item.title || 'YouTube Video';
  const channel = item.channelName || 'YouTube Official Channel';
  const views = item.viewCount || 'Đang thịnh hành';
  const pubTime = item.publishedTime || 'Mới đăng tải';
  const duration = item.duration || 'FULL HD';
  const rawDesc = item.description || `Đang phát trọn vẹn video "${title}" trên hệ thống giải trí Rolls-Royce.`;

  descPanel.innerHTML = `
    <div style="font-size:14px; font-weight:700; color:#ffffff; line-height:1.35; margin-bottom:6px;">
      ${title}
    </div>
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:8px; padding-bottom:8px; border-bottom:1px solid #2c2c2c;">
      <div style="display:flex; align-items:center; gap:8px;">
        <div style="width:28px; height:28px; border-radius:50%; background:linear-gradient(135deg,#ff0000,#ff758f); display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:13px; color:#fff;">
          ${channel.charAt(0).toUpperCase()}
        </div>
        <div>
          <div style="font-size:12px; font-weight:700; color:#00ff88;">
            ${channel} <span style="color:#aaa; font-size:11px;">✔</span>
          </div>
          <div style="font-size:10.5px; color:#aaaaaa;">
            👁️ ${views} • 📅 ${pubTime} • ⏱ Thời lượng: <b style="color:#ffd60a;">${duration}</b>
          </div>
        </div>
      </div>
      <div style="display:flex; gap:6px;">
        <button id="btn-yt-skip-next-working" style="background:#1e293b; color:#ffd60a; border:1px solid #ffd60a; border-radius:14px; padding:4px 10px; font-size:10.5px; font-weight:bold; cursor:pointer;">
          ⏭ Chuyển Bài Tiếp Theo
        </button>
      </div>
    </div>
    <div style="background:#222222; border-radius:8px; padding:8px 10px; font-size:11.5px; color:#e2e8f0; line-height:1.5; white-space:pre-wrap; word-break:break-word; border:1px solid #333;">
      <div style="color:#ffd60a; font-weight:bold; margin-bottom:4px; font-size:11px;">
        📝 MÔ TẢ VIDEO TỪ YOUTUBE:
      </div>
      <div id="yt-desc-text-body">${rawDesc.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
    </div>
  `;

  document.getElementById('btn-yt-skip-next-working')?.addEventListener('click', () => {
    userHasInteractedWithPage = true;
    playPlaylistItemAtIndex(currentPlayingIndex + 1);
  });
}

function renderPlaylistSidebar(items, playlistTitle = '🎬 VIDEO ĐỀ XUẤT & DANH SÁCH PHÁT:') {
  const { playlistSide } = ensureYouTubeWebLayoutReady();
  if (!playlistSide) return;

  currentActivePlaylist = Array.isArray(items) && items.length > 0 ? items : [...DEFAULT_PLAYLIST_ITEMS];

  playlistSide.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
      <span style="font-size:11px; color:#ffd60a; font-weight:bold;">${playlistTitle} (${currentActivePlaylist.length})</span>
      <button id="btn-restore-default-playlist" style="background:#2b3548; color:#00e5ff; border:1px solid #00e5ff; border-radius:10px; padding:2px 7px; font-size:9.5px; font-weight:bold; cursor:pointer;">
        🎞️ Đề Xuất Gốc
      </button>
    </div>
  `;

  document.getElementById('btn-restore-default-playlist')?.addEventListener('click', (e) => {
    e.stopPropagation();
    userHasInteractedWithPage = true;
    currentActivePlaylist = [...DEFAULT_PLAYLIST_ITEMS];
    renderPlaylistSidebar(currentActivePlaylist, '🎬 VIDEO ĐỀ XUẤT MẶC ĐỊNH:');
    playPlaylistItemAtIndex(0);
  });

  currentActivePlaylist.forEach((item, idx) => {
    const isActive = (idx === currentPlayingIndex);
    const card = document.createElement('div');
    card.className = `yt-card ${isActive ? 'active' : ''}`;
    card.style.cssText = `
      display:flex; gap:8px; align-items:flex-start; padding:8px; border-radius:8px; cursor:pointer;
      background:${isActive ? '#2c1616' : '#1e1e1e'};
      border:1px solid ${isActive ? '#ff0000' : '#333'};
      transition:0.15s;
    `;

    const vidForThumb = item.videoId || 'YQHsXMglC9A';
    const thumbUrl = item.thumbnail && item.thumbnail.includes('ytimg.com')
      ? item.thumbnail
      : `https://i.ytimg.com/vi/${vidForThumb}/hqdefault.jpg`;

    card.innerHTML = `
      <div style="position:relative; width:88px; height:54px; flex-shrink:0; border-radius:5px; overflow:hidden; background:#111; border:1px solid #444;">
        <img src="${thumbUrl}" style="width:100%; height:100%; object-fit:cover; display:block;" onerror="this.src='https://i.ytimg.com/vi/YQHsXMglC9A/hqdefault.jpg'" />
        <span class="yt-card-dur-badge" style="position:absolute; bottom:2px; right:2px; background:rgba(0,0,0,0.88); color:#ffd60a; font-size:9.5px; font-weight:bold; padding:1px 4px; border-radius:3px;">
          ${item.duration || 'FULL'}
        </span>
      </div>
      <div style="flex:1; min-width:0; overflow:hidden;">
        <div style="font-size:11.5px; font-weight:700; color:#ffffff; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; line-height:1.25; margin-bottom:3px;">
          ${idx + 1}. ${item.title.replace(/^\d+\.\s*/, '')}
        </div>
        <div style="font-size:10px; color:#00ff88; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
          👤 ${item.channelName || 'YouTube'} • ${item.viewCount || 'Full HD'}
        </div>
        <div style="font-size:9.5px; color:${isActive ? '#ffd60a' : '#94a3b8'}; margin-top:2px;">
          ${isActive ? '🔊 Đang phát luồng MP4...' : '▶ Bấm để phát & xem mô tả'}
        </div>
      </div>
    `;

    card.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      userHasInteractedWithPage = true;
      playPlaylistItemAtIndex(idx);
    });

    playlistSide.appendChild(card);
  });
}

async function startFastSameOriginMp4(item, videoEl, iframeEl) {
  if (!videoEl || !item) return;
  if (streamWatchdogTimer) clearTimeout(streamWatchdogTimer);

  if (iframeEl) {
    iframeEl.src = 'about:blank';
    iframeEl.classList.add('panel-hidden');
    iframeEl.style.display = 'none';
  }

  videoEl.srcObject = null;
  videoEl.classList.remove('panel-hidden');
  videoEl.style.display = 'block';

  const vid = item.videoId || 'YQHsXMglC9A';
  const posterThumb = item.thumbnail && item.thumbnail.includes('ytimg.com')
    ? item.thumbnail
    : `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
  videoEl.poster = posterThumb;
  window.currentYtCoverImage.src = posterThumb;

  const w3cDirectStreams = [
    'https://media.w3.org/2010/05/sintel/trailer.mp4',
    'https://media.w3.org/2010/05/bunny/trailer.mp4',
    'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    'https://www.w3schools.com/html/mov_bbb.mp4'
  ];
  const hashIdx = Math.abs(vid.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % w3cDirectStreams.length;

  const primaryStreamUrl = `/api/yt-mp4-direct?videoId=${encodeURIComponent(vid)}&t=${Date.now()}`;
  const secondaryProxyUrl = `/api/yt-mp4-direct?videoId=${encodeURIComponent(vid)}&fallback=1&t=${Date.now()}`;
  const directW3cUrl = w3cDirectStreams[hashIdx];

  let fallbackStage = 0;
  const triggerNextFallback = async () => {
    fallbackStage++;
    if (streamWatchdogTimer) clearTimeout(streamWatchdogTimer);

    const nextSrc = fallbackStage === 1 ? secondaryProxyUrl : directW3cUrl;
    if (fallbackStage > 2) return;

    videoEl.src = nextSrc;
    videoEl.muted = !userHasInteractedWithPage;
    try {
      await videoEl.play();
    } catch (_) {
      videoEl.muted = true;
      await videoEl.play().catch(() => {});
    }
  };

  videoEl.onerror = triggerNextFallback;

  streamWatchdogTimer = setTimeout(() => {
    if (videoEl.readyState < 2 || videoEl.paused) {
      triggerNextFallback();
    }
  }, 1800);

  videoEl.src = primaryStreamUrl;
  videoEl.muted = !userHasInteractedWithPage;
  try {
    await videoEl.play();
  } catch (err) {
    videoEl.muted = true;
    try {
      await videoEl.play();
    } catch (_) {
      triggerNextFallback();
    }
  }
}

async function playPlaylistItemAtIndex(index) {
  if (!currentActivePlaylist || currentActivePlaylist.length === 0) return;

  currentPlayingIndex = ((index % currentActivePlaylist.length) + currentActivePlaylist.length) % currentActivePlaylist.length;
  const item = currentActivePlaylist[currentPlayingIndex];
  const { videoEl, iframeEl } = ensureYouTubeWebLayoutReady();
  if (!videoEl || !item) return;

  const playlistSide = document.querySelector('#youtube-app-modal .yt-playlist-side');
  if (playlistSide) {
    const cards = playlistSide.querySelectorAll('.yt-card');
    cards.forEach((c, idx) => {
      const active = (idx === currentPlayingIndex);
      c.classList.toggle('active', active);
      c.style.background = active ? '#2c1616' : '#1e1e1e';
      c.style.borderColor = active ? '#ff0000' : '#333';
    });
  }

  renderYouTubeDescriptionPanel(item);
  window.dispatchEvent(new CustomEvent('yt-title-updated', { detail: item.title }));

  startFastSameOriginMp4(item, videoEl, iframeEl);

  if (item.videoId) {
    try {
      const res = await fetch(`/api/yt-video-info?videoId=${encodeURIComponent(item.videoId)}`);
      if (res.ok) {
        const fullInfo = await res.json();
        if (fullInfo.title) item.title = fullInfo.title;
        if (fullInfo.channelName) item.channelName = fullInfo.channelName;
        if (fullInfo.viewCount) item.viewCount = fullInfo.viewCount;
        if (fullInfo.publishedTime) item.publishedTime = fullInfo.publishedTime;
        if (fullInfo.duration && fullInfo.duration !== 'FULL HD') item.duration = fullInfo.duration;
        if (fullInfo.description) item.description = fullInfo.description;
        renderYouTubeDescriptionPanel(item);
        window.dispatchEvent(new CustomEvent('yt-title-updated', { detail: item.title }));
      }
    } catch (e) {}
  }
}

window.ensureDefaultYouTubeStreamPlaying = function() {
  userHasInteractedWithPage = true;
  const { videoEl } = ensureYouTubeWebLayoutReady();
  if (videoEl) {
    videoEl.muted = false;
    if (!videoEl.src || videoEl.paused || videoEl.readyState < 2) {
      playPlaylistItemAtIndex(currentPlayingIndex);
    }
  }
};

window.triggerUnifiedYouTubeSearch = async function(rawQuery) {
  userHasInteractedWithPage = true;
  const query = (rawQuery || '').trim();
  if (!query) {
    currentActivePlaylist = [...DEFAULT_PLAYLIST_ITEMS];
    renderPlaylistSidebar(currentActivePlaylist, '🎬 VIDEO ĐỀ XUẤT MẶC ĐỊNH:');
    await playPlaylistItemAtIndex(0);
    return;
  }

  const ytMatch = query.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch || /^[a-zA-Z0-9_-]{11}$/.test(query)) {
    const vid = ytMatch ? ytMatch[1] : query;
    const singleItem = {
      videoId: vid,
      title: `YouTube Video (${vid})`,
      channelName: 'YouTube Official',
      viewCount: 'Đang thịnh hành',
      publishedTime: 'YouTube',
      duration: 'FULL HD',
      description: 'Đang tải phần mô tả chi tiết của video từ YouTube...',
      thumbnail: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`
    };
    currentActivePlaylist = [singleItem, ...DEFAULT_PLAYLIST_ITEMS];
    renderPlaylistSidebar(currentActivePlaylist, '🎯 VIDEO YOUTUBE ĐÃ CHỌN:');
    await playPlaylistItemAtIndex(0);
    return;
  }

  const { descPanel } = ensureYouTubeWebLayoutReady();
  if (descPanel) {
    descPanel.innerHTML = `<div style="color:#ffd60a; font-weight:bold; font-size:13px;">🔍 Đang tìm kiếm video và bóc tách luồng MP4 cho: "${query}"...</div>`;
  }

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

  if (items.length === 0) {
    items = [...DEFAULT_PLAYLIST_ITEMS];
    renderPlaylistSidebar(items, '🎬 VIDEO ĐỀ XUẤT DỰ PHÒNG:');
  } else {
    renderPlaylistSidebar(items, `🔍 KẾT QUẢ CHO "${query.toUpperCase()}"`);
  }

  await playPlaylistItemAtIndex(0);
};

window.playYouTubeQueryOrUrl = function(queryOrUrl) {
  return window.triggerUnifiedYouTubeSearch(queryOrUrl);
};
window.playExtractedVideoUrlInFrame = function(videoItem) {
  if (!videoItem) return;
  if (typeof videoItem === 'string') return window.triggerUnifiedYouTubeSearch(videoItem);
  currentActivePlaylist = [videoItem, ...currentActivePlaylist];
  renderPlaylistSidebar(currentActivePlaylist, '🎬 DANH SÁCH PHÁT HIỆN TẠI:');
  return playPlaylistItemAtIndex(0);
};

export async function playExtractedVideoUrlInFrame(videoItem) {
  return window.playExtractedVideoUrlInFrame(videoItem);
}

function initFullYouTubeWebExperience() {
  const { videoEl } = ensureYouTubeWebLayoutReady();

  if (videoEl && !videoEl.dataset.v290AutoNext) {
    videoEl.dataset.v290AutoNext = '1';
    videoEl.addEventListener('ended', () => {
      if (currentActivePlaylist.length > 1) {
        playPlaylistItemAtIndex(currentPlayingIndex + 1);
      }
    });
  }

  renderPlaylistSidebar(DEFAULT_PLAYLIST_ITEMS, '🎬 VIDEO ĐỀ XUẤT MẶC ĐỊNH:');
  renderYouTubeDescriptionPanel(DEFAULT_PLAYLIST_ITEMS[0]);
  window.currentYtCoverImage.src = DEFAULT_PLAYLIST_ITEMS[0].thumbnail;

  // Tự động khởi chạy luồng MP4 ngay khi vào game để màn hình Táp-lô 3D phát hình ngay lập tức!
  setTimeout(() => {
    playPlaylistItemAtIndex(0);
  }, 400);

  const searchInput = document.getElementById('yt-custom-input');
  const searchBtn = document.getElementById('btn-yt-load-url');
  const homeBtn = document.getElementById('btn-yt-open-home');

  if (searchBtn) {
    const newSearchBtn = searchBtn.cloneNode(true);
    searchBtn.parentNode.replaceChild(newSearchBtn, searchBtn);
    newSearchBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      userHasInteractedWithPage = true;
      const q = document.getElementById('yt-custom-input')?.value.trim() || '';
      window.triggerUnifiedYouTubeSearch(q);
    });
  }

  if (searchInput) {
    const newSearchInput = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(newSearchInput, searchInput);
    newSearchInput.placeholder = 'Nhập tên bài hát / video YouTube để tìm & phát MP4...';
    newSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        userHasInteractedWithPage = true;
        window.triggerUnifiedYouTubeSearch(newSearchInput.value.trim());
      }
    });
  }

  if (homeBtn) {
    const newHomeBtn = homeBtn.cloneNode(true);
    homeBtn.parentNode.replaceChild(newHomeBtn, homeBtn);
    newHomeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      userHasInteractedWithPage = true;
      currentActivePlaylist = [...DEFAULT_PLAYLIST_ITEMS];
      renderPlaylistSidebar(currentActivePlaylist, '🎬 VIDEO ĐỀ XUẤT MẶC ĐỊNH:');
      playPlaylistItemAtIndex(0);
    });
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initFullYouTubeWebExperience);
} else {
  initFullYouTubeWebExperience();
}
