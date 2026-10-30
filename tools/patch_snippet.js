const fs = require('fs');
let s = fs.readFileSync('tools/liquid_gear_snippet.html', 'utf8');

const roleCss = `
  /* 5. Role Seat Badge hiển thị vai trò thời gian thực */
  #v260-role-seat-badge {
    position: fixed;
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 980;
    padding: 7px 18px;
    border-radius: 20px;
    font-size: 13.5px;
    font-weight: 700;
    letter-spacing: 0.5px;
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    transition: all 0.3s ease;
    pointer-events: none;
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.45);
    user-select: none;
  }
  .role-driver {
    background: rgba(0, 35, 20, 0.88);
    border: 1.5px solid #00ff88;
    color: #00ff88;
    text-shadow: 0 0 8px rgba(0, 255, 136, 0.5);
  }
  .role-passenger {
    background: rgba(10, 25, 45, 0.88);
    border: 1.5px solid #00d2ff;
    color: #00d2ff;
    text-shadow: 0 0 8px rgba(0, 210, 255, 0.5);
  }
  .role-foot {
    background: rgba(35, 30, 10, 0.88);
    border: 1.5px solid #ffd60a;
    color: #ffd60a;
    text-shadow: 0 0 8px rgba(255, 214, 10, 0.5);
  }
  @media (max-width: 768px) {
    #v260-role-seat-badge {
      font-size: 11px;
      padding: 5px 12px;
      top: 10px;
      max-width: 90vw;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }
`;

if (!s.includes('v260-role-seat-badge')) {
  s = s.replace('</style>', roleCss + '\n</style>');
  s += '\n<div id="v260-role-seat-badge" class="v260-role-badge role-driver">\n  🚗 TÀI XẾ (GHẾ 0) — ĐIỀU KHIỂN CHÍNH [5X SPEED]\n</div>\n';
  fs.writeFileSync('tools/liquid_gear_snippet.html', s, 'utf8');
  console.log('[SUCCESS] Added role seat badge to liquid_gear_snippet.html');
} else {
  console.log('[INFO] Already contains v260-role-seat-badge');
}
