// GLSL for the 3D bodies, from the HTML prototype. The surface is computed on the GPU.

/** 3D simplex noise (Ashima Arts / Stefan Gustavson, MIT) and fractal sum. */
const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float fbm(vec3 p){float f=0.,a=.5;for(int i=0;i<4;i++){f+=a*snoise(p);p*=2.03;a*=.5;}return f;}
`;

export const SURFACE_VERTEX = /* glsl */ `
varying vec3 vPos;
varying vec3 vN;
varying vec3 vV;
void main(){
  vPos=position;
  vN=normalize(normalMatrix*normal);
  vec4 mv=modelViewMatrix*vec4(position,1.);
  vV=normalize(-mv.xyz);
  gl_Position=projectionMatrix*mv;
}
`;

/**
 * Animated granulation (stars) or a slowly turning surface lit from one side (planets).
 * stretch: noise scale per axis (bands on gas giants).
 */
export const SURFACE_FRAGMENT = /* glsl */ `
uniform float t;
uniform vec3 c1;
uniform vec3 c2;
uniform float ns;
uniform vec3 stretch;
uniform float lit;
uniform vec3 lightDir;
varying vec3 vPos;
varying vec3 vN;
varying vec3 vV;
${NOISE}
void main(){
  vec3 p=vPos*ns*stretch;
  float n=fbm(p+vec3(t*.3,t*.2,-t*.25));
  float cells=snoise(p*2.6-vec3(t*.5))*.5+.5;
  vec3 col=mix(c2,c1,clamp(n*.65+.55,0.,1.));
  float f=max(dot(vN,vV),0.);
  if(lit>.5){
    float day=smoothstep(-.12,.55,dot(vN,normalize(lightDir)));
    col*=mix(.05,1.08,day);
    col+=c1*pow(1.-f,4.)*.18*day;
  }else{
    col+=c1*pow(cells,3.)*.4;
    col*=mix(.5,1.2,pow(f,.55));
    col+=c1*pow(1.-f,3.)*.35;
  }
  gl_FragColor=vec4(col,1.);
}
`;

/** Atmosphere: a back-facing shell that glows at the rim. */
export const GLOW_VERTEX = /* glsl */ `
varying float I;
void main(){
  vec3 n=normalize(normalMatrix*normal);
  vec4 mv=modelViewMatrix*vec4(position,1.);
  I=pow(max(-dot(n,normalize(-mv.xyz)),0.),2.2);
  gl_Position=projectionMatrix*mv;
}
`;

export const GLOW_FRAGMENT = /* glsl */ `
uniform vec3 c;
uniform float k;
varying float I;
void main(){ gl_FragColor=vec4(c*I*k,1.); }
`;
