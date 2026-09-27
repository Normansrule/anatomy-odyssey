/* GLSL for the Solar System page (solar-system.js).
 *
 * Noise: 3D simplex noise by Ian McEwan and Stefan Gustavson (Ashima Arts),
 * MIT licence, https://github.com/ashima/webgl-noise
 * Every surface is procedurally generated from noise: they are impressions of
 * each world's colours and features, not maps.
 */

export const NOISE = /* glsl */`
vec3 mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x){ return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
float fbm(vec3 p, int oct){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 9; i++) { if (i >= oct) break; s += a * snoise(p); p = p * 2.02 + vec3(3.1, 1.7, 4.3); a *= 0.5; }
  return s;
}
float ridged(vec3 p, int oct){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 9; i++) { if (i >= oct) break; float n = 1.0 - abs(snoise(p)); s += a * n * n; p = p * 2.03 + vec3(1.3, 7.1, 2.9); a *= 0.5; }
  return s;
}
vec3 hash3(vec3 p){
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453123);
}
float gauss(float x, float c, float w){ float t = (x - c) / w; return exp(-t * t); }
`;

/* ------------------------------------------------------------------ bake --- */
export const BAKE_VERT = /* glsl */`
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export const BAKE_FRAG = /* glsl */`
precision highp float;
uniform int uType;
uniform float uSeed;
uniform mat3 uGal;
varying vec2 vUv;
${NOISE}
const float PI = 3.14159265359;
float latOf(vec3 d){ return asin(clamp(d.y, -1.0, 1.0)); }
float lonOf(vec3 d){ return atan(d.z, -d.x); }
vec3 S(vec3 d){ return d + vec3(uSeed * 1.7, uSeed * 2.3, uSeed * 0.9); }
float dlon(float a, float b){ return atan(sin(a - b), cos(a - b)); }

// crater field: x = bowl shading (<=0), y = rim brightness
vec2 craters(vec3 p, float density){
  vec3 c = floor(p), f = fract(p);
  float shade = 0.0, rim = 0.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
    vec3 n = vec3(float(x), float(y), float(z));
    vec3 h = hash3(c + n);
    vec3 k = hash3(c + n + 17.31);
    if (k.x > density) continue;
    float r = 0.16 + 0.32 * k.y;
    float d = length(n + h - f) / r;
    if (d < 1.0) shade = min(shade, -(1.0 - d * d));
    rim = max(rim, exp(-pow((d - 1.0) * 5.0, 2.0)));
  }
  return vec2(shade, rim);
}
vec3 craterize(vec3 col, vec3 p, float k){
  vec2 a = craters(p * 5.0, 0.55), b = craters(p * 12.0, 0.5), c = craters(p * 28.0, 0.45);
  float sh = a.x * 0.35 + b.x * 0.25 + c.x * 0.15;
  float rim = a.y * 0.22 + b.y * 0.16 + c.y * 0.1;
  return col * (1.0 + k * (sh * 0.55 + rim * 0.9));
}

vec4 mercury(vec3 d){
  vec3 p = S(d);
  float n = fbm(p * 2.5, 6) * 0.5 + 0.5;
  vec3 col = mix(vec3(0.33, 0.31, 0.29), vec3(0.63, 0.60, 0.56), n);
  col = craterize(col, p, 1.0);
  col += vec3(0.22) * smoothstep(0.80, 0.95, fbm(p * 9.0 + 4.0, 3) * 0.5 + 0.5);
  return vec4(col, 1.0);
}
vec4 venus(vec3 d){
  vec3 p = S(d); float la = latOf(d); float lo = lonOf(d);
  vec3 q = vec3(d.x * 1.5, d.y * 6.0, d.z * 1.5) + uSeed;
  float w = fbm(q + fbm(p * 2.0, 4), 5);
  float n = fbm(p * 3.0 + w, 4);
  vec3 col = mix(vec3(0.80, 0.66, 0.44), vec3(0.97, 0.91, 0.74), 0.55 + 0.4 * n + 0.2 * w);
  float chev = smoothstep(0.55, 0.95, sin(lo + abs(la) * 2.6 + w * 1.4) * 0.5 + 0.5) * (1.0 - smoothstep(0.6, 1.2, abs(la)));
  col = mix(col, vec3(0.72, 0.58, 0.38), chev * 0.35);
  col = mix(col, vec3(0.93, 0.90, 0.82), smoothstep(1.0, 1.4, abs(la)) * 0.5);
  return vec4(col, 1.0);
}
// Earth elevation field shared by the day map and the lights/cloud map
float earthH(vec3 p){
  vec3 w = vec3(fbm(p * 1.2, 4), fbm(p * 1.2 + 5.2, 4), fbm(p * 1.2 + 9.7, 4));
  return fbm(p * 1.1 + w * 0.6, 7) + 0.08 * ridged(p * 3.0, 4);
}
vec4 earthDay(vec3 d){
  vec3 p = S(d) * 1.4;
  float h = earthH(p);
  float sea = 0.19;
  float land = smoothstep(sea, sea + 0.01, h);
  float alat = abs(latOf(d)) / (0.5 * PI);
  float depth = clamp((sea - h) * 3.0, 0.0, 1.0);
  vec3 ocean = mix(vec3(0.07, 0.32, 0.45), vec3(0.01, 0.07, 0.22), pow(depth, 0.35));
  float e = clamp((h - sea) * 2.4, 0.0, 1.0);
  float moist = fbm(p * 2.3 + 3.3, 4) * 0.5 + 0.5;
  float belt = gauss(alat, 0.27, 0.11);
  float dry = clamp(belt * 1.25 - moist * 0.8 + 0.1, 0.0, 1.0);
  vec3 lc = mix(vec3(0.07, 0.19, 0.06), vec3(0.24, 0.30, 0.12), smoothstep(0.3, 0.8, moist + alat * 0.4));
  lc = mix(lc, vec3(0.64, 0.52, 0.34), smoothstep(0.4, 0.75, dry));
  lc = mix(lc, vec3(0.40, 0.39, 0.32), smoothstep(0.58, 0.74, alat));
  lc = mix(lc, vec3(0.46, 0.41, 0.37), smoothstep(0.4, 0.9, e));
  lc *= 0.9 + 0.2 * (fbm(p * 8.0, 3) * 0.5 + 0.5);
  float ice = smoothstep(0.80, 0.85, alat + 0.05 * fbm(p * 4.0, 3) + e * 0.12);
  vec3 col = mix(ocean, lc, land);
  col = mix(col, vec3(0.93, 0.96, 0.99), ice);
  return vec4(col, (1.0 - land) * (1.0 - ice));
}
vec4 earthAux(vec3 d){
  vec3 p = S(d) * 1.4;
  float h = earthH(p);
  float land = smoothstep(0.19, 0.2, h);
  float la = latOf(d); float alat = abs(la) / (0.5 * PI);
  float ice = smoothstep(0.78, 0.84, alat);
  float dry = gauss(alat, 0.27, 0.10);
  float coast = gauss(h, 0.22, 0.05);
  float region = smoothstep(0.55, 0.8, fbm(p * 5.0 + 2.0, 4) * 0.5 + 0.5 + coast * 0.3);
  float towns = smoothstep(0.62, 0.9, snoise(p * 60.0) * 0.5 + 0.5);
  float cities = smoothstep(0.7, 0.95, snoise(p * 22.0 + 3.0) * 0.5 + 0.5);
  float lights = land * (1.0 - ice) * (1.0 - dry * 0.6) * gauss(alat, 0.4, 0.3)
               * (region * (0.55 * cities + 0.45 * towns) + 0.05 * towns);
  // clouds: domain-warped noise, busier in the storm tracks and the intertropical convergence zone
  vec3 c = vec3(d.x * 2.4, d.y * 4.2, d.z * 2.4) + vec3(7.0, 3.0, 1.0);
  vec3 wq = vec3(fbm(c * 1.3, 4), fbm(c * 1.3 + 4.0, 4), fbm(c * 1.3 + 8.0, 4));
  float cn = fbm(c * 1.5 + wq * 1.8, 6) * 0.5 + 0.5;
  float cover = 0.36 + 0.20 * gauss(la, 0.0, 0.10) + 0.18 * gauss(alat, 0.62, 0.14) - 0.22 * dry;
  float cloud = smoothstep(1.0 - cover, 1.0 - cover + 0.22, cn);
  float wisp = fbm(vec3(d.x * 14.0, d.y * 26.0, d.z * 14.0) + wq * 3.0, 4) * 0.5 + 0.5;
  cloud *= 0.55 + 0.45 * smoothstep(0.3, 0.7, wisp);
  return vec4(clamp(lights, 0.0, 1.0), cloud, 0.0, 1.0);
}
vec4 mars(vec3 d){
  vec3 p = S(d); float la = latOf(d); float lo = lonOf(d);
  float alb = fbm(p * 1.8, 6) * 0.5 + 0.5;
  float dk = smoothstep(0.54, 0.68, fbm(p * 1.1 + 2.0, 5) * 0.5 + 0.5 + 0.12 * sin(la * 2.0 + 0.5));
  vec3 col = mix(vec3(0.66, 0.34, 0.18), vec3(0.83, 0.50, 0.29), alb);
  col = mix(col, vec3(0.36, 0.22, 0.15), dk * 0.8);
  col = craterize(col, p * 1.3, 0.35);
  float hel = 1.0 - smoothstep(0.6, 1.0, length(vec2(dlon(lo, 1.2) * cos(la) / 0.28, (la + 0.73) / 0.2)));
  col = mix(col, vec3(0.86, 0.62, 0.42), hel * 0.6);
  float vm = exp(-pow((la + 0.14 + 0.025 * sin(lo * 9.0)) / 0.012, 2.0)) * smoothstep(-1.55, -1.35, lo) * smoothstep(-0.2, -0.45, lo);
  col = mix(col, vec3(0.28, 0.14, 0.09), vm * 0.8);
  float ns = fbm(p * 6.0, 4) * 0.05;
  float cap = max(smoothstep(1.37, 1.41, la + ns), smoothstep(1.42, 1.46, -la + ns));
  col = mix(col, vec3(0.96, 0.94, 0.91), cap);
  return vec4(col, 1.0);
}
vec4 jupiter(vec3 d){
  vec3 p = S(d); float la = degrees(latOf(d)); float lo = lonOf(d);
  vec3 q = vec3(d.x * 3.0, d.y * 16.0, d.z * 3.0) + uSeed;
  float t1 = fbm(q, 5), t2 = fbm(q * 2.1 + vec3(5.0, 1.0, 2.0), 4);
  float gLat = -22.4, gLon = 1.1;
  vec2 e = vec2(degrees(dlon(lo, gLon)) * cos(radians(gLat)) / 7.5, (la - gLat) / 4.6);
  float er = length(e);
  float sw = exp(-er * er * 0.5) * 2.6;
  vec2 ew = vec2(cos(sw) * e.x - sin(sw) * e.y, sin(sw) * e.x + cos(sw) * e.y);
  float laW = la + t1 * 3.0 + t2 * 1.1;
  laW += (ew.y - e.y) * 5.0 * exp(-er * er * 0.25);
  float dk = 0.0;
  dk += 0.95 * gauss(laW, 13.0, 4.8);
  dk += 0.95 * gauss(laW, -14.0, 5.2);
  dk += 0.55 * gauss(laW, 24.0, 2.4);
  dk += 0.50 * gauss(laW, -29.0, 2.8);
  dk += 0.42 * gauss(laW, 35.0, 2.4);
  dk += 0.40 * gauss(laW, -37.5, 2.4);
  dk += 0.30 * gauss(laW, 43.5, 2.8);
  dk += 0.30 * gauss(laW, -45.0, 2.8);
  dk += 0.16 * gauss(laW, 0.0, 1.5);
  dk = clamp(dk, 0.0, 1.0);
  vec3 col = mix(vec3(0.95, 0.91, 0.83), vec3(0.70, 0.47, 0.31), dk);
  col = mix(col, vec3(0.46, 0.30, 0.21), smoothstep(0.62, 1.0, dk) * (0.5 + 0.5 * t2));
  col = mix(col, vec3(0.92, 0.80, 0.62), gauss(la, 0.0, 6.0) * 0.45);
  float fest = gauss(la + t2 * 1.5, 7.0, 1.2) * smoothstep(0.45, 0.8, snoise(vec3(d.x * 11.0, d.z * 11.0, la * 0.2 + uSeed)));
  col = mix(col, vec3(0.50, 0.46, 0.50), fest * 0.45);
  float pol = smoothstep(46.0, 68.0, abs(la));
  col = mix(col, vec3(0.56, 0.53, 0.52) * (0.85 + 0.3 * (fbm(p * 8.0, 4) * 0.5 + 0.5)), pol * 0.85);
  col *= 0.91 + 0.18 * (fbm(q * 3.0, 4) * 0.5 + 0.5);
  float spot = 1.0 - smoothstep(0.72, 1.02, er);
  float collar = gauss(er, 1.14, 0.17);
  vec3 red = vec3(0.80, 0.37, 0.22) * (0.85 + 0.3 * (snoise(vec3(ew * 3.0, 1.0)) * 0.5 + 0.5));
  col = mix(col, vec3(0.97, 0.93, 0.86), collar * 0.55);
  col = mix(col, red, spot * (0.7 + 0.3 * smoothstep(0.9, 0.2, er)));
  for (int k = 0; k < 3; k++) {
    float ol = gLon + 1.7 + float(k) * 0.6;
    vec2 oe = vec2(degrees(dlon(lo, ol)) * cos(radians(33.0)) / 2.4, (la + 33.5) / 1.6);
    col = mix(col, vec3(0.97, 0.95, 0.92), (1.0 - smoothstep(0.6, 1.0, length(oe))) * 0.85);
  }
  return vec4(col, 1.0);
}
vec4 saturn(vec3 d){
  float la = degrees(latOf(d)); float lo = lonOf(d);
  vec3 q = vec3(d.x * 3.0, d.y * 22.0, d.z * 3.0) + uSeed;
  float t = fbm(q, 4);
  float laW = la + t * 1.4;
  float dk = 0.0;
  dk += 0.55 * gauss(laW, 19.0, 4.0) + 0.55 * gauss(laW, -19.0, 4.0);
  dk += 0.40 * gauss(laW, 31.0, 3.0) + 0.40 * gauss(laW, -32.0, 3.0);
  dk += 0.35 * gauss(laW, 42.0, 3.0) + 0.35 * gauss(laW, -43.0, 3.0);
  dk += 0.30 * gauss(laW, 54.0, 4.0) + 0.30 * gauss(laW, -55.0, 4.0);
  dk += 0.12 * sin(laW * 1.3) ;
  vec3 col = mix(vec3(0.94, 0.87, 0.68), vec3(0.78, 0.63, 0.42), clamp(dk, 0.0, 1.0));
  col = mix(col, vec3(0.98, 0.93, 0.78), gauss(la, 0.0, 8.0) * 0.4);
  col *= 0.95 + 0.1 * (fbm(q * 2.5, 4) * 0.5 + 0.5);
  float cr = 90.0 - la;
  float sector = mod(lo + PI / 6.0, PI / 3.0) - PI / 6.0;
  float hexR = 14.5 / cos(sector);
  float hex = smoothstep(hexR + 0.8, hexR - 0.8, cr);
  col = mix(col, vec3(0.52, 0.60, 0.64), hex * 0.75);
  col = mix(col, vec3(0.85, 0.82, 0.72), gauss(cr, hexR, 0.6) * 0.5);
  col = mix(col, vec3(0.30, 0.35, 0.42), smoothstep(5.0, 0.0, cr));
  col = mix(col, vec3(0.70, 0.66, 0.58), smoothstep(60.0, 80.0, -la) * 0.5);
  return vec4(col, 1.0);
}
vec4 uranus(vec3 d){
  float la = degrees(latOf(d));
  vec3 q = vec3(d.x * 2.0, d.y * 10.0, d.z * 2.0) + uSeed;
  float t = fbm(q, 4);
  vec3 col = vec3(0.64, 0.86, 0.89);
  col *= 0.97 + 0.05 * sin((la + t * 3.0) * 0.35);
  col = mix(col, vec3(0.82, 0.94, 0.95), smoothstep(45.0, 72.0, la + t * 4.0) * 0.65);
  col *= 0.97 + 0.05 * (fbm(q * 2.0, 3) * 0.5 + 0.5);
  return vec4(col, 1.0);
}
vec4 neptune(vec3 d){
  float la = degrees(latOf(d)); float lo = lonOf(d);
  vec3 q = vec3(d.x * 3.0, d.y * 14.0, d.z * 3.0) + uSeed;
  float t = fbm(q, 5);
  vec3 col = vec3(0.24, 0.42, 0.88);
  col = mix(col, vec3(0.16, 0.28, 0.70), (gauss(la + t * 4.0, -40.0, 9.0) + gauss(la + t * 4.0, 35.0, 8.0)) * 0.6);
  col = mix(col, vec3(0.34, 0.54, 0.95), gauss(la, 0.0, 12.0) * 0.4);
  float cir = smoothstep(0.62, 0.82, fbm(vec3(d.x * 4.0, d.y * 36.0, d.z * 4.0) + uSeed * 3.0, 4) * 0.5 + 0.5);
  col = mix(col, vec3(0.92, 0.95, 1.0), cir * (gauss(la, -24.0, 8.0) + gauss(la, 28.0, 6.0) + 0.3 * gauss(la, -60.0, 6.0)) * 0.9);
  vec2 e = vec2(degrees(dlon(lo, 2.2)) * cos(radians(20.0)) / 9.0, (la - 20.0) / 5.0);
  col = mix(col, vec3(0.10, 0.17, 0.45), (1.0 - smoothstep(0.6, 1.0, length(e))) * 0.7);
  col *= 0.95 + 0.1 * (fbm(q * 2.0, 3) * 0.5 + 0.5);
  return vec4(col, 1.0);
}
vec4 pluto(vec3 d){
  vec3 p = S(d); float la = degrees(latOf(d)); float lo = lonOf(d);
  vec3 col = vec3(0.74, 0.60, 0.46) * (0.82 + 0.35 * (fbm(p * 3.0, 5) * 0.5 + 0.5));
  vec2 h1 = vec2(degrees(dlon(lo, 2.35)) * cos(radians(la)), la - 25.0) / vec2(20.0, 22.0);
  vec2 h2 = vec2(degrees(dlon(lo, 2.95)) * cos(radians(la)), la - 12.0) / vec2(24.0, 22.0);
  float wob = 0.12 * snoise(p * 6.0);
  float heart = max(1.0 - smoothstep(0.8, 1.05, length(h1) + wob), 1.0 - smoothstep(0.8, 1.05, length(h2) + wob));
  float cth = gauss(la, -8.0, 14.0) * smoothstep(0.3, 0.8, lo) * smoothstep(2.1, 1.75, lo);
  cth = clamp(cth * (0.8 + 0.6 * fbm(p * 4.0, 4)), 0.0, 1.0);
  vec2 cell = craters(p * 14.0, 1.0);
  vec3 ice = vec3(0.93, 0.90, 0.86) * (0.93 + 0.07 * (fbm(p * 9.0, 3) * 0.5 + 0.5)) * (1.0 - 0.06 * cell.y);
  col = mix(col, ice, heart);
  col = mix(col, vec3(0.30, 0.15, 0.10), cth * 0.9);
  col = mix(col, vec3(0.55, 0.40, 0.32), smoothstep(55.0, 80.0, la) * 0.5);
  col = craterize(col, p, 0.35 * (1.0 - heart));
  return vec4(col, 1.0);
}
vec4 ceres(vec3 d){
  vec3 p = S(d); float la = degrees(latOf(d)); float lo = lonOf(d);
  vec3 col = mix(vec3(0.33, 0.32, 0.30), vec3(0.48, 0.47, 0.45), fbm(p * 3.0, 5) * 0.5 + 0.5);
  col = craterize(col, p, 1.0);
  vec2 o1 = vec2(degrees(dlon(lo, 0.4)) * cos(radians(20.0)), la - 20.0) / 1.2;
  vec2 o2 = vec2(degrees(dlon(lo, 0.46)) * cos(radians(20.0)), la - 19.0) / 0.8;
  col = mix(col, vec3(0.97), max(1.0 - smoothstep(0.5, 1.0, length(o1)), 1.0 - smoothstep(0.5, 1.0, length(o2))));
  return vec4(col, 1.0);
}
vec4 moon(vec3 d){
  vec3 p = S(d);
  float m = smoothstep(0.12, 0.3, fbm(p * 1.4, 5) * 0.8 + 0.25 * d.x - 0.08);
  vec3 col = mix(vec3(0.66, 0.65, 0.62), vec3(0.40, 0.40, 0.41), m * 0.9);
  col *= 0.88 + 0.24 * (fbm(p * 6.0, 4) * 0.5 + 0.5);
  col = craterize(col, p, 0.8 - 0.4 * m);
  vec3 ty = normalize(vec3(0.55, -0.68, -0.1));
  float a = acos(clamp(dot(d, ty), -1.0, 1.0));
  vec3 t = normalize(cross(ty, d + 1e-4));
  float ray = smoothstep(0.55, 0.95, snoise(t * 18.0) * 0.5 + 0.5) * smoothstep(1.2, 0.05, a);
  col += vec3(0.25) * ray + vec3(0.4) * smoothstep(0.05, 0.02, a);
  return vec4(col, 1.0);
}
vec4 io(vec3 d){
  vec3 p = S(d); float la = degrees(latOf(d));
  float n = fbm(p * 3.0, 5) * 0.5 + 0.5;
  vec3 col = mix(vec3(0.93, 0.84, 0.42), vec3(0.86, 0.60, 0.26), smoothstep(0.4, 0.72, n));
  col = mix(col, vec3(0.96, 0.94, 0.84), smoothstep(0.62, 0.8, fbm(p * 5.0 + 3.0, 4) * 0.5 + 0.5) * 0.7);
  col = mix(col, vec3(0.55, 0.40, 0.28), smoothstep(40.0, 78.0, abs(la)) * 0.8);
  vec3 c = floor(p * 8.0), f = fract(p * 8.0); float vol = 0.0, halo = 0.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
    vec3 nn = vec3(float(x), float(y), float(z)); vec3 h = hash3(c + nn);
    if (h.z > 0.3) continue;
    float dd = length(nn + h - f);
    vol = max(vol, 1.0 - smoothstep(0.04, 0.09 + h.x * 0.06, dd));
    halo = max(halo, 1.0 - smoothstep(0.1, 0.28 + h.y * 0.12, dd));
  }
  col = mix(col, vec3(0.78, 0.30, 0.14), halo * 0.55);
  col = mix(col, vec3(0.10, 0.07, 0.05), vol);
  return vec4(col, 1.0);
}
vec4 europa(vec3 d){
  vec3 p = S(d);
  vec3 col = mix(vec3(0.88, 0.85, 0.78), vec3(0.66, 0.54, 0.42), smoothstep(0.5, 0.8, fbm(p * 2.5, 5) * 0.5 + 0.5) * 0.8);
  float l1 = smoothstep(0.965, 0.995, 1.0 - abs(snoise(p * 3.0)));
  float l2 = smoothstep(0.97, 0.995, 1.0 - abs(snoise(p * 7.0 + 5.0)));
  col = mix(col, vec3(0.55, 0.33, 0.20), max(l1, l2 * 0.7) * 0.85);
  return vec4(col, 1.0);
}
vec4 ganymede(vec3 d){
  vec3 p = S(d);
  float g = smoothstep(0.45, 0.6, fbm(p * 1.8, 5) * 0.5 + 0.5);
  float groove = 0.5 + 0.5 * sin(dot(p, vec3(40.0, 22.0, 31.0)) + fbm(p * 4.0, 3) * 6.0);
  vec3 col = mix(vec3(0.36, 0.33, 0.30), vec3(0.64, 0.61, 0.57) * (0.9 + 0.12 * groove), g);
  col = craterize(col, p, 0.7);
  return vec4(col, 1.0);
}
vec4 callisto(vec3 d){
  vec3 p = S(d);
  vec3 col = mix(vec3(0.24, 0.21, 0.19), vec3(0.36, 0.32, 0.28), fbm(p * 3.0, 5) * 0.5 + 0.5);
  vec2 a = craters(p * 10.0, 0.6), b = craters(p * 22.0, 0.6);
  col += vec3(0.45) * (a.y * 0.5 + b.y * 0.35) + vec3(0.25) * smoothstep(-0.2, -0.9, a.x);
  return vec4(col, 1.0);
}
vec4 sky(vec3 d){
  vec3 g = uGal * d;                        // galactic unit vector
  float b = asin(clamp(g.z, -1.0, 1.0));
  float l = atan(g.y, g.x);
  float bulge = exp(-pow(l / 0.55, 2.0)) * exp(-pow(b / 0.22, 2.0));
  float width = 0.10 + 0.07 * exp(-pow(l / 0.9, 2.0));
  float band = exp(-pow(b / width, 2.0));
  float n = fbm(g * 4.0, 6) * 0.5 + 0.5;
  float clumps = smoothstep(0.35, 0.9, fbm(g * 9.0 + 2.0, 5) * 0.5 + 0.5);
  float dust = smoothstep(0.42, 0.72, fbm(g * 7.0 + 3.0, 6) * 0.5 + 0.5) * exp(-pow(b / (width * 0.45), 2.0));
  float I = band * (0.30 + 0.55 * n + 0.35 * clumps) * (0.55 + 0.8 * exp(-pow(l / 1.2, 2.0))) + bulge * 1.3;
  I *= 1.0 - dust * 0.85;
  vec3 col = mix(vec3(0.55, 0.64, 0.95), vec3(1.0, 0.82, 0.62), clamp(bulge * 1.5 + exp(-pow(l / 1.0, 2.0)) * 0.4, 0.0, 1.0));
  col *= I * 0.20;
  float neb = smoothstep(0.6, 0.95, fbm(g * 3.0 + 9.0, 5) * 0.5 + 0.5) * band;
  col += vec3(0.9, 0.3, 0.45) * neb * 0.035;
  col += vec3(0.012, 0.016, 0.035) * (fbm(g * 2.0 + 5.0, 4) * 0.5 + 0.5);
  return vec4(col, 1.0);
}

void main(){
  float phi = vUv.x * 2.0 * PI, th = (1.0 - vUv.y) * PI;
  vec3 d = vec3(-cos(phi) * sin(th), cos(th), sin(phi) * sin(th));
  vec4 c;
  if (uType == 0) c = mercury(d);
  else if (uType == 1) c = venus(d);
  else if (uType == 2) c = earthDay(d);
  else if (uType == 3) c = earthAux(d);
  else if (uType == 4) c = mars(d);
  else if (uType == 5) c = jupiter(d);
  else if (uType == 6) c = saturn(d);
  else if (uType == 7) c = uranus(d);
  else if (uType == 8) c = neptune(d);
  else if (uType == 9) c = pluto(d);
  else if (uType == 10) c = ceres(d);
  else if (uType == 11) c = moon(d);
  else if (uType == 12) c = io(d);
  else if (uType == 13) c = europa(d);
  else if (uType == 14) c = ganymede(d);
  else if (uType == 15) c = callisto(d);
  else c = sky(d);
  gl_FragColor = vec4(clamp(c.rgb, 0.0, 1.0), c.a);
}
`;

/* ---------------------------------------------------------------- planet --- */
export const PLANET_VERT = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv; varying vec3 vN; varying vec3 vP; varying vec3 vObj;
void main(){
  vUv = uv; vObj = position;
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vP = mv.xyz;
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}
`;
export const PLANET_FRAG = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uMap;
uniform vec3 uSunView;
uniform vec3 uAtm;
uniform float uAtmK;
uniform float uSun;
uniform float uAmbient;
#ifdef EARTH
uniform sampler2D uAux;
uniform float uCloudShift;
#endif
#ifdef RINGSHADOW
uniform sampler2D uRing;
uniform vec2 uRingR;
uniform vec3 uSunObj;
#endif
varying vec2 vUv; varying vec3 vN; varying vec3 vP; varying vec3 vObj;
vec3 toLin(vec3 c){ return pow(c, vec3(2.2)); }
void main(){
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vN), V = normalize(-vP), L = normalize(uSunView - vP);
  vec4 tex = texture2D(uMap, vUv);
  vec3 alb = toLin(tex.rgb);
  float NL = dot(N, L);
  float diff = clamp((NL + 0.04) / 1.04, 0.0, 1.0);
  diff = pow(diff, 0.85);
  #ifdef RINGSHADOW
  vec3 ps = normalize(vObj), Ls = normalize(uSunObj);
  if (abs(Ls.y) > 1e-4) {
    float t = -ps.y / Ls.y;
    if (t > 0.0) {
      vec3 q = ps + t * Ls; float r = length(q.xz);
      if (r > uRingR.x && r < uRingR.y) {
        float a = texture2D(uRing, vec2((r - uRingR.x) / (uRingR.y - uRingR.x), 0.5)).a;
        diff *= 1.0 - 0.85 * a;
      }
    }
  }
  #endif
  vec3 col = alb * diff * uSun;
  float fres = pow(1.0 - max(dot(N, V), 0.0), 2.5);
  #ifdef EARTH
  vec2 cuv = vUv + vec2(uCloudShift, 0.0);
  float cloud = texture2D(uAux, cuv).g;
  float cshadow = texture2D(uAux, cuv + vec2(0.002, 0.001)).g;
  float ocean = tex.a;
  col *= 1.0 - 0.4 * cshadow;
  vec3 H = normalize(L + V);
  float NH = max(dot(N, H), 0.0);
  float spec = (pow(NH, 300.0) * 0.8 + pow(NH, 40.0) * 0.03) * ocean * (1.0 - cloud);
  col += vec3(1.0, 0.92, 0.8) * spec * diff * uSun;
  col = mix(col, vec3(0.95, 0.97, 1.0) * diff * uSun, cloud * 0.92);
  float night = smoothstep(0.08, -0.18, NL);
  float lights = texture2D(uAux, vUv).r;
  col += vec3(1.0, 0.62, 0.28) * lights * night * 1.6 * (1.0 - cloud * 0.85);
  #endif
  // warm terminator and atmospheric limb
  col += alb * vec3(0.35, 0.12, 0.02) * exp(-pow(NL / 0.12, 2.0)) * uAtmK * 0.5;
  col += uAtm * fres * uAtmK * smoothstep(-0.25, 0.6, NL);
  col += alb * uAmbient;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const ATMO_VERT = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vN; varying vec3 vP;
void main(){
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vP = mv.xyz;
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}
`;
export const ATMO_FRAG = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor; uniform vec3 uSunView; uniform float uK; uniform float uShell;
varying vec3 vN; varying vec3 vP;
void main(){
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vN), V = normalize(-vP), L = normalize(uSunView - vP);
  float s = sqrt(1.0 - 1.0 / (uShell * uShell));
  float x = clamp(-dot(N, V) / s, 0.0, 1.0);
  float I = pow(x, 2.2);
  float lit = smoothstep(-0.35, 0.45, dot(N, L));
  gl_FragColor = vec4(uColor * I * lit * uK, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const RING_FRAG = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uRing; uniform vec2 uRingR; uniform vec3 uSunObj; uniform vec3 uCamObj; uniform float uSun;
varying vec3 vObj;
vec3 toLin(vec3 c){ return pow(c, vec3(2.2)); }
void main(){
  #include <logdepthbuf_fragment>
  float r = length(vObj.xz);
  float u = (r - uRingR.x) / (uRingR.y - uRingR.x);
  if (u < 0.0 || u > 1.0) discard;
  vec4 rc = texture2D(uRing, vec2(u, 0.5));
  vec3 col = toLin(rc.rgb); float a = rc.a;
  vec3 Ls = normalize(uSunObj);
  float b = dot(vObj, Ls), c = dot(vObj, vObj) - 1.0;
  float sh = 1.0;
  if (b < 0.0) sh = mix(1.0, 0.05, smoothstep(-0.02, 0.02, b * b - c));
  bool litSide = (Ls.y > 0.0) == (uCamObj.y > 0.0);
  float elev = smoothstep(0.0, 0.3, abs(Ls.y));
  float lightAmt = litSide ? (0.35 + 0.75 * elev) : (0.12 + 0.6 * (1.0 - a)) * (0.4 + 0.6 * elev);
  gl_FragColor = vec4(col * lightAmt * sh * uSun, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
export const RING_VERT = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vObj;
void main(){
  vObj = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
`;

/* ------------------------------------------------------------------- Sun --- */
export const SUN_FRAG = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uTime;
varying vec2 vUv; varying vec3 vN; varying vec3 vP; varying vec3 vObj;
${NOISE}
void main(){
  #include <logdepthbuf_fragment>
  vec3 p = normalize(vObj);
  float mu = max(dot(normalize(vN), normalize(-vP)), 0.0);
  float n1 = fbm(p * 3.5 + vec3(0.0, uTime * 0.015, 0.0), 4);
  float gran = snoise(p * 34.0 + vec3(uTime * 0.06)) * 0.5 + 0.5;
  float gran2 = snoise(p * 90.0 - vec3(uTime * 0.05)) * 0.5 + 0.5;
  float spots = smoothstep(0.74, 0.8, fbm(p * 4.5 + 11.0, 4) * 0.5 + 0.5 + 0.06 * (1.0 - abs(p.y) * 2.5));
  float pen = smoothstep(0.68, 0.74, fbm(p * 4.5 + 11.0, 4) * 0.5 + 0.5 + 0.06 * (1.0 - abs(p.y) * 2.5));
  float fac = smoothstep(0.55, 0.7, fbm(p * 5.0 + 3.0, 3) * 0.5 + 0.5) * (1.0 - mu);
  vec3 hot = vec3(1.0, 0.66, 0.24), warm = vec3(0.92, 0.26, 0.02);
  float heat = 0.62 + 0.45 * n1 + 0.5 * (gran - 0.5) + 0.2 * (gran2 - 0.5);
  vec3 col = mix(warm, hot, clamp(heat, 0.0, 1.0));
  float limb = 0.30 + 0.70 * pow(mu, 0.5);
  col *= limb;
  col = mix(col, vec3(1.0, 0.9, 0.7), fac * 0.45);
  col *= (1.0 - 0.35 * pen) * (1.0 - 0.75 * spots);
  col = mix(col, warm * 0.8, pow(1.0 - mu, 2.0) * 0.55);
  gl_FragColor = vec4(col * 1.7, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
export const CORONA_VERT = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv;
void main(){
  vUv = uv * 2.0 - 1.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
`;
export const CORONA_FRAG = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uTime; uniform float uCore; uniform float uK;
varying vec2 vUv;
${NOISE}
void main(){
  #include <logdepthbuf_fragment>
  float rr = length(vUv);
  float r = rr / uCore;                         // in (effective) solar radii
  float a = atan(vUv.y, vUv.x);
  vec3 dir = vec3(cos(a), sin(a), 0.0);
  float glow = r < 1.0 ? 1.4 : 1.4 / pow(r, 2.6);
  float rays = fbm(dir * 2.2 + vec3(0.0, 0.0, uTime * 0.02 + r * 0.05), 4) * 0.5 + 0.5;
  float fine = fbm(dir * 9.0 + vec3(0.0, 0.0, uTime * 0.03), 3) * 0.5 + 0.5;
  float streamer = pow(rays, 3.0) * (0.6 + 0.8 * fine) * 1.8 / pow(max(r, 1.0), 1.5) * smoothstep(7.5, 1.1, r);
  float wide = 0.16 / pow(max(r, 1.0), 1.0);
  vec3 col = vec3(1.0, 0.78, 0.45) * glow + vec3(1.0, 0.84, 0.6) * streamer * 0.28 + vec3(1.0, 0.5, 0.2) * wide * 0.22;
  col *= smoothstep(1.0, 0.7, rr) * uK;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/* -------------------------------------------------------- lines & points --- */
export const ORBIT_VERT = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float aPhase;
uniform float uA; uniform float uP; uniform float uPhase;
varying float vFade; varying float vRaw;
void main(){
  vec3 p = position; float r = max(length(p), 1e-9);
  vec3 q = p * (uA * pow(r, uP) / r);
  vFade = fract(uPhase - aPhase); vRaw = aPhase;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(q, 1.0);
  #include <logdepthbuf_vertex>
}
`;
export const ORBIT_FRAG = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor; uniform float uOpacity; uniform float uTrail; uniform float uDash;
varying float vFade; varying float vRaw;
void main(){
  #include <logdepthbuf_fragment>
  if (uDash > 0.0 && fract(vRaw * uDash) > 0.55) discard;
  float a = mix(1.0, mix(1.0, 0.16, smoothstep(0.0, 0.9, vFade)), uTrail);
  a += uTrail * 0.6 * (1.0 - smoothstep(0.0, 0.03, vFade));
  gl_FragColor = vec4(uColor * a * uOpacity, 1.0);
}
`;

export const BELT_VERT = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec4 aEl;   // a [AU], e, inclination [rad], node [rad]
attribute vec4 aEl2;  // longitude of perihelion [rad], mean anomaly at J2000 [rad], mean motion [rad/day], size
attribute vec3 color;
uniform float uDays; uniform float uA; uniform float uP; uniform float uPx; uniform float uSizeK;
varying vec3 vCol;
void main(){
  float a = aEl.x, e = aEl.y, I = aEl.z, O = aEl.w, w = aEl2.x - O;
  float M = mod(aEl2.y + aEl2.z * uDays, 6.2831853);
  float E = M + e * sin(M);
  for (int k = 0; k < 5; k++) E -= (E - e * sin(E) - M) / (1.0 - e * cos(E));
  float xp = a * (cos(E) - e), yp = a * sqrt(1.0 - e * e) * sin(E);
  float cw = cos(w), sw = sin(w), cO = cos(O), sO = sin(O), cI = cos(I), sI = sin(I);
  vec3 ecl = vec3((cw*cO - sw*sO*cI) * xp + (-sw*cO - cw*sO*cI) * yp,
                  (cw*sO + sw*cO*cI) * xp + (-sw*sO + cw*cO*cI) * yp,
                  (sw*sI) * xp + (cw*sI) * yp);
  float r = length(ecl);
  vec3 q = vec3(ecl.x, ecl.z, -ecl.y) * (uA * pow(r, uP) / r);
  vec4 mv = modelViewMatrix * vec4(q, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(1.0, aEl2.w * uSizeK) * uPx;
  vCol = color;
  #include <logdepthbuf_vertex>
}
`;
export const BELT_FRAG = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uOpacity;
varying vec3 vCol;
void main(){
  #include <logdepthbuf_fragment>
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.05, d) * uOpacity;
  gl_FragColor = vec4(vCol * a, 1.0);
}
`;

export const MARKER_VERT = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 color; attribute float aAlpha; attribute float aShape;
uniform float uPx;
varying vec3 vCol; varying float vA; varying float vShape;
void main(){
  vCol = color; vA = aAlpha; vShape = aShape;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = (aShape > 0.5 ? 13.0 : 15.0) * uPx;
  #include <logdepthbuf_vertex>
}
`;
export const MARKER_FRAG = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
varying vec3 vCol; varying float vA; varying float vShape;
void main(){
  #include <logdepthbuf_fragment>
  vec2 c = gl_PointCoord - 0.5;
  float a;
  if (vShape > 0.5) {
    float m = abs(c.x) + abs(c.y);
    a = smoothstep(0.30, 0.22, m) * 0.25 + smoothstep(0.05, 0.0, abs(m - 0.3)) * 0.9 + smoothstep(0.12, 0.04, m);
  } else {
    float d = length(c);
    a = smoothstep(0.17, 0.08, d) + smoothstep(0.045, 0.0, abs(d - 0.36)) * 0.55 + smoothstep(0.5, 0.0, d) * 0.25;
  }
  gl_FragColor = vec4(vCol * a * vA, 1.0);
}
`;

export const SKY_VERT = /* glsl */`
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
export const SKY_FRAG = /* glsl */`
uniform sampler2D uMap; uniform float uK;
varying vec2 vUv;
void main(){ vec3 c = texture2D(uMap, vUv).rgb; gl_FragColor = vec4(c * uK, 1.0); }
`;
export const STAR_VERT = /* glsl */`
attribute vec3 color; attribute float aSize;
uniform float uPx;
varying vec3 vCol;
void main(){ vCol = color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uPx; }
`;
export const STAR_FRAG = /* glsl */`
varying vec3 vCol;
void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); a *= a; gl_FragColor = vec4(vCol * a, 1.0); }
`;
