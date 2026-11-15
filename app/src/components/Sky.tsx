import { useEffect } from "react";
import { Platform, StyleSheet, View } from "react-native";

import { useTheme } from "../lib/theme";

/**
 * The playful background: a slow-drifting starfield with the odd shooting star at night, soft
 * floating colour by day. Pure CSS (gradients and transforms, no images), so it costs nothing to
 * load; it holds still when the device asks for reduced motion. Web only.
 */
const CSS = `
#kosmik-sky{overflow:hidden;pointer-events:none;z-index:0}
#kosmik-sky::before,#kosmik-sky::after{content:"";position:absolute;inset:-50%;will-change:transform}
html[data-theme=dark] #kosmik-sky{background:
  radial-gradient(1100px 600px at 12% -12%,rgba(181,74,132,.20),transparent 60%),
  radial-gradient(900px 520px at 108% 108%,rgba(120,64,200,.16),transparent 62%),
  radial-gradient(600px 400px at 70% 30%,rgba(232,166,90,.05),transparent 70%)}
html[data-theme=dark] #kosmik-sky::before{opacity:.55;background-size:240px 240px;animation:ks-drift 160s linear infinite;background-image:
  radial-gradient(1px 1px at 22px 34px,#fff,transparent 60%),radial-gradient(1px 1px at 140px 92px,rgba(255,255,255,.8),transparent 60%),
  radial-gradient(1.4px 1.4px at 196px 168px,#f6c6e2,transparent 60%),radial-gradient(1px 1px at 64px 200px,rgba(255,255,255,.7),transparent 60%),
  radial-gradient(1px 1px at 108px 14px,rgba(255,236,200,.8),transparent 60%)}
html[data-theme=dark] #kosmik-sky::after{opacity:.35;background-size:420px 420px;animation:ks-drift 260s linear infinite reverse,ks-twinkle 6s ease-in-out infinite;background-image:
  radial-gradient(1.6px 1.6px at 80px 120px,#fff,transparent 60%),radial-gradient(1.2px 1.2px at 300px 60px,#ffd9a8,transparent 60%),
  radial-gradient(1.8px 1.8px at 360px 330px,#f2b8d8,transparent 60%),radial-gradient(1.2px 1.2px at 190px 380px,#fff,transparent 60%)}
#kosmik-comet{position:absolute;top:12%;left:-10%;width:140px;height:1.5px;border-radius:2px;opacity:0;
  background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,230,245,.9));transform:rotate(-18deg);animation:ks-comet 14s ease-in 4s infinite}
html[data-theme=light] #kosmik-comet{display:none}
html[data-theme=light] #kosmik-sky::before{inset:-20%;animation:ks-float 28s ease-in-out infinite alternate;background:
  radial-gradient(520px 380px at 12% 8%,rgba(236,166,200,.30),transparent 62%),
  radial-gradient(480px 360px at 92% 20%,rgba(255,196,140,.26),transparent 62%),
  radial-gradient(560px 420px at 70% 96%,rgba(196,170,255,.22),transparent 62%)}
html[data-theme=light] #kosmik-sky::after{inset:0;opacity:.5;background-image:radial-gradient(rgba(142,47,99,.07) 1px,transparent 1.2px);background-size:22px 22px}
@keyframes ks-drift{from{transform:translate3d(0,0,0)}to{transform:translate3d(-240px,-120px,0)}}
@keyframes ks-twinkle{0%,100%{opacity:.25}50%{opacity:.45}}
@keyframes ks-float{from{transform:translate3d(-2%,-1%,0) scale(1)}to{transform:translate3d(2%,2%,0) scale(1.06)}}
@keyframes ks-comet{0%{opacity:0;transform:translate3d(0,0,0) rotate(-18deg)}3%{opacity:1}12%{opacity:0;transform:translate3d(70vw,22vh,0) rotate(-18deg)}100%{opacity:0}}
@media (prefers-reduced-motion:reduce){#kosmik-sky::before,#kosmik-sky::after,#kosmik-comet{animation:none!important}}
`;

let injected = false;

export function Sky() {
  const { isDark } = useTheme();
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    if (!injected) {
      const el = document.createElement("style");
      el.textContent = CSS;
      document.head.appendChild(el);
      injected = true;
    }
    document.documentElement.dataset.theme = isDark ? "dark" : "light";
  }, [isDark]);
  if (Platform.OS !== "web") return null;
  return (
    <View
      nativeID="kosmik-sky"
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      <View nativeID="kosmik-comet" />
    </View>
  );
}
