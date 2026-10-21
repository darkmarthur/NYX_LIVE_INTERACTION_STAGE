// Compiled into styles.css; the blocking loader never waits for a network asset.
export const TRANSFER_CSS = `
/* Request overlay. No inline styles, images, extra network requests or fake progress. */
html.nyx-sending{overflow:hidden}
.nyx-transfer{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;overscroll-behavior:contain;touch-action:none;pointer-events:auto;background:rgba(2,7,8,.96);padding:24px;text-align:center;outline:0}
.nyx-transfer-content{display:flex;flex-direction:column;align-items:center;gap:18px;max-width:310px;color:var(--fg)}
.nyx-transfer strong{font:800 18px var(--mono);letter-spacing:3px}
.nyx-transfer p{font:12px/1.7 var(--mono);letter-spacing:.4px;color:#b6cbca;margin:0}
#nyx-transfer-wait:empty{display:none}
.nyx-transfer-particles{width:156px;height:156px;position:relative;animation:nyx-transfer-orbit 5.5s linear infinite}
.nyx-transfer-particles i{position:absolute;left:50%;top:50%;display:block;width:4px;height:4px;border-radius:50%;background:#83e8dc;opacity:.62;transform:translate(var(--tx),var(--ty));animation:nyx-transfer-pulse 1.8s ease-in-out infinite alternate;animation-delay:var(--delay)}
.nyx-transfer-particles i:nth-child(5n){width:2px;height:2px;background:#d6a0c5}
.nyx-transfer-particles i:nth-child(7n){width:6px;height:6px}
.nyx-transfer-particles i:nth-child(1){--tx:10px;--ty:0px;--delay:0.000s}
.nyx-transfer-particles i:nth-child(2){--tx:12px;--ty:5px;--delay:-0.075s}
.nyx-transfer-particles i:nth-child(3){--tx:9px;--ty:12px;--delay:-0.150s}
.nyx-transfer-particles i:nth-child(4){--tx:0px;--ty:17px;--delay:-0.225s}
.nyx-transfer-particles i:nth-child(5){--tx:-14px;--ty:18px;--delay:-0.300s}
.nyx-transfer-particles i:nth-child(6){--tx:-27px;--ty:12px;--delay:-0.375s}
.nyx-transfer-particles i:nth-child(7){--tx:-36px;--ty:0px;--delay:-0.450s}
.nyx-transfer-particles i:nth-child(8){--tx:-35px;--ty:-15px;--delay:-0.525s}
.nyx-transfer-particles i:nth-child(9){--tx:-22px;--ty:-29px;--delay:-0.600s}
.nyx-transfer-particles i:nth-child(10){--tx:0px;--ty:-37px;--delay:-0.675s}
.nyx-transfer-particles i:nth-child(11){--tx:27px;--ty:-35px;--delay:-0.750s}
.nyx-transfer-particles i:nth-child(12){--tx:50px;--ty:-22px;--delay:-0.825s}
.nyx-transfer-particles i:nth-child(13){--tx:-10px;--ty:0px;--delay:-0.900s}
.nyx-transfer-particles i:nth-child(14){--tx:-12px;--ty:-5px;--delay:-0.975s}
.nyx-transfer-particles i:nth-child(15){--tx:-9px;--ty:-12px;--delay:-1.050s}
.nyx-transfer-particles i:nth-child(16){--tx:0px;--ty:-17px;--delay:-1.125s}
.nyx-transfer-particles i:nth-child(17){--tx:14px;--ty:-18px;--delay:-1.200s}
.nyx-transfer-particles i:nth-child(18){--tx:27px;--ty:-12px;--delay:-1.275s}
.nyx-transfer-particles i:nth-child(19){--tx:36px;--ty:0px;--delay:-1.350s}
.nyx-transfer-particles i:nth-child(20){--tx:35px;--ty:15px;--delay:-1.425s}
.nyx-transfer-particles i:nth-child(21){--tx:22px;--ty:29px;--delay:-1.500s}
.nyx-transfer-particles i:nth-child(22){--tx:0px;--ty:37px;--delay:-1.575s}
.nyx-transfer-particles i:nth-child(23){--tx:-27px;--ty:35px;--delay:-1.650s}
.nyx-transfer-particles i:nth-child(24){--tx:-50px;--ty:22px;--delay:-1.725s}
@keyframes nyx-transfer-orbit{to{transform:rotate(360deg)}}
@keyframes nyx-transfer-pulse{from{opacity:.12}to{opacity:.9}}
@media(prefers-reduced-motion:reduce){.nyx-transfer-particles,.nyx-transfer-particles i{animation:none}}
`;
