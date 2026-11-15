import Svg, { Circle, Defs, LinearGradient, Path, Polygon, Stop } from "react-native-svg";

/** Kosmik's mark: a plum orb with a gold star, a crescent and an orbiting spark. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel="Kosmik">
      <Defs>
        <LinearGradient id="kosmik-orb" x1="0.15" y1="0.1" x2="0.9" y2="0.95">
          <Stop offset="0" stopColor="#D2659F" />
          <Stop offset="0.55" stopColor="#8E2F63" />
          <Stop offset="1" stopColor="#2A0B26" />
        </LinearGradient>
      </Defs>
      <Circle cx="32" cy="32" r="31" fill="url(#kosmik-orb)" />
      <Circle cx="32" cy="32" r="23.5" fill="none" stroke="#F3D19A" strokeWidth="0.9" opacity="0.55" />
      <Polygon points="32,11 36.2,27.8 53,32 36.2,36.2 32,53 27.8,36.2 11,32 27.8,27.8" fill="#F3D19A" />
      <Polygon points="32,22 33.8,30.2 42,32 33.8,33.8 32,42 30.2,33.8 22,32 30.2,30.2" fill="#6E1F4F" />
      <Path d="M47.5 10.5a6 6 0 1 0 5.2 9.3 4.7 4.7 0 1 1-5.2-9.3z" fill="#F3D19A" />
      <Circle cx="14.5" cy="47" r="1.8" fill="#F3D19A" />
      <Circle cx="50" cy="46" r="1.1" fill="#F3D19A" opacity="0.8" />
    </Svg>
  );
}

/** The same mark as an SVG string, for the favicon and the landing page. */
export const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="o" x1="0.15" y1="0.1" x2="0.9" y2="0.95"><stop offset="0" stop-color="#D2659F"/><stop offset="0.55" stop-color="#8E2F63"/><stop offset="1" stop-color="#2A0B26"/></linearGradient></defs><circle cx="32" cy="32" r="31" fill="url(#o)"/><circle cx="32" cy="32" r="23.5" fill="none" stroke="#F3D19A" stroke-width="0.9" opacity="0.55"/><polygon points="32,11 36.2,27.8 53,32 36.2,36.2 32,53 27.8,36.2 11,32 27.8,27.8" fill="#F3D19A"/><polygon points="32,22 33.8,30.2 42,32 33.8,33.8 32,42 30.2,33.8 22,32 30.2,30.2" fill="#6E1F4F"/><path d="M47.5 10.5a6 6 0 1 0 5.2 9.3 4.7 4.7 0 1 1-5.2-9.3z" fill="#F3D19A"/><circle cx="14.5" cy="47" r="1.8" fill="#F3D19A"/><circle cx="50" cy="46" r="1.1" fill="#F3D19A" opacity="0.8"/></svg>`;
