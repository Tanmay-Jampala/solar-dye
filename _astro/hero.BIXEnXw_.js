import{t as e}from"./three.module.DBn9wGL_.js";import{n as t,r as n}from"./env.NlvSuV4I.js";import{a as r,c as i,n as a,o,r as s,t as c}from"./OutputPass.tkvUsrU9.js";import{$ as l,An as u,E as d,F as f,J as ee,P as p,Pn as te,T as ne,Z as m,Zt as re,cn as ie,d as h,gt as g,jn as _,ln as v,nt as y,ot as ae,st as oe,ut as b,w as x,xn as S}from"./three.core.BeTNsWxX.js";import{t as se}from"./molecules.CnIlM-HQ.js";var C={name:`BokehShader`,defines:{DEPTH_PACKING:1,PERSPECTIVE_CAMERA:1},uniforms:{tColor:{value:null},tDepth:{value:null},focus:{value:1},aspect:{value:1},aperture:{value:.025},maxblur:{value:.01},nearClip:{value:1},farClip:{value:1e3}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		#include <common>

		varying vec2 vUv;

		uniform sampler2D tColor;
		uniform sampler2D tDepth;

		uniform float maxblur; // max blur amount
		uniform float aperture; // aperture - bigger values for shallower depth of field

		uniform float nearClip;
		uniform float farClip;

		uniform float focus;
		uniform float aspect;

		#include <packing>

		float getDepth( const in vec2 screenPosition ) {
			#if DEPTH_PACKING == 1
			return unpackRGBAToDepth( texture2D( tDepth, screenPosition ) );
			#else
			return texture2D( tDepth, screenPosition ).x;
			#endif
		}

		float getViewZ( const in float depth ) {
			#if PERSPECTIVE_CAMERA == 1
			return perspectiveDepthToViewZ( depth, nearClip, farClip );
			#else
			return orthographicDepthToViewZ( depth, nearClip, farClip );
			#endif
		}


		void main() {

			vec2 aspectcorrect = vec2( 1.0, aspect );

			float viewZ = getViewZ( getDepth( vUv ) );

			float factor = ( focus + viewZ ); // viewZ is <= 0, so this is a difference equation

			vec2 dofblur = vec2 ( clamp( factor * aperture, -maxblur, maxblur ) );

			vec2 dofblur9 = dofblur * 0.9;
			vec2 dofblur7 = dofblur * 0.7;
			vec2 dofblur4 = dofblur * 0.4;

			vec4 col = vec4( 0.0 );

			col += texture2D( tColor, vUv.xy );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.0,   0.4  ) * aspectcorrect ) * dofblur );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.15,  0.37 ) * aspectcorrect ) * dofblur );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.29,  0.29 ) * aspectcorrect ) * dofblur );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.37,  0.15 ) * aspectcorrect ) * dofblur );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.40,  0.0  ) * aspectcorrect ) * dofblur );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.37, -0.15 ) * aspectcorrect ) * dofblur );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.29, -0.29 ) * aspectcorrect ) * dofblur );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.15, -0.37 ) * aspectcorrect ) * dofblur );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.0,  -0.4  ) * aspectcorrect ) * dofblur );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.15,  0.37 ) * aspectcorrect ) * dofblur );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.29,  0.29 ) * aspectcorrect ) * dofblur );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.37,  0.15 ) * aspectcorrect ) * dofblur );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.4,   0.0  ) * aspectcorrect ) * dofblur );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.37, -0.15 ) * aspectcorrect ) * dofblur );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.29, -0.29 ) * aspectcorrect ) * dofblur );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.15, -0.37 ) * aspectcorrect ) * dofblur );

			col += texture2D( tColor, vUv.xy + ( vec2(  0.15,  0.37 ) * aspectcorrect ) * dofblur9 );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.37,  0.15 ) * aspectcorrect ) * dofblur9 );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.37, -0.15 ) * aspectcorrect ) * dofblur9 );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.15, -0.37 ) * aspectcorrect ) * dofblur9 );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.15,  0.37 ) * aspectcorrect ) * dofblur9 );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.37,  0.15 ) * aspectcorrect ) * dofblur9 );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.37, -0.15 ) * aspectcorrect ) * dofblur9 );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.15, -0.37 ) * aspectcorrect ) * dofblur9 );

			col += texture2D( tColor, vUv.xy + ( vec2(  0.29,  0.29 ) * aspectcorrect ) * dofblur7 );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.40,  0.0  ) * aspectcorrect ) * dofblur7 );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.29, -0.29 ) * aspectcorrect ) * dofblur7 );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.0,  -0.4  ) * aspectcorrect ) * dofblur7 );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.29,  0.29 ) * aspectcorrect ) * dofblur7 );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.4,   0.0  ) * aspectcorrect ) * dofblur7 );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.29, -0.29 ) * aspectcorrect ) * dofblur7 );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.0,   0.4  ) * aspectcorrect ) * dofblur7 );

			col += texture2D( tColor, vUv.xy + ( vec2(  0.29,  0.29 ) * aspectcorrect ) * dofblur4 );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.4,   0.0  ) * aspectcorrect ) * dofblur4 );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.29, -0.29 ) * aspectcorrect ) * dofblur4 );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.0,  -0.4  ) * aspectcorrect ) * dofblur4 );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.29,  0.29 ) * aspectcorrect ) * dofblur4 );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.4,   0.0  ) * aspectcorrect ) * dofblur4 );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.29, -0.29 ) * aspectcorrect ) * dofblur4 );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.0,   0.4  ) * aspectcorrect ) * dofblur4 );

			gl_FragColor = col / 41.0;
			gl_FragColor.a = 1.0;

		}`},ce=class extends o{constructor(e,t,n){super(),this.scene=e,this.camera=t;let i=n.focus===void 0?1:n.focus,a=n.aperture===void 0?.025:n.aperture,o=n.maxblur===void 0?1:n.maxblur;this._renderTargetDepth=new te(1,1,{minFilter:y,magFilter:y,type:p}),this._renderTargetDepth.texture.name=`BokehPass.depth`,this._materialDepth=new m,this._materialDepth.depthPacking=g,this._materialDepth.blending=0;let s=S.clone(C.uniforms);s.tDepth.value=this._renderTargetDepth.texture,s.focus.value=i,s.aspect.value=t.aspect,s.aperture.value=a,s.maxblur.value=o,s.nearClip.value=t.near,s.farClip.value=t.far,this.materialBokeh=new v({defines:Object.assign({},C.defines),uniforms:s,vertexShader:C.vertexShader,fragmentShader:C.fragmentShader}),this.uniforms=s,this._fsQuad=new r(this.materialBokeh),this._oldClearColor=new h}render(e,t,n){this.scene.overrideMaterial=this._materialDepth,e.getClearColor(this._oldClearColor);let r=e.getClearAlpha(),i=e.autoClear;e.autoClear=!1,e.setClearColor(16777215),e.setClearAlpha(1),e.setRenderTarget(this._renderTargetDepth),e.clear(),e.render(this.scene,this.camera),this.uniforms.tColor.value=n.texture,this.uniforms.nearClip.value=this.camera.near,this.uniforms.farClip.value=this.camera.far,this.renderToScreen?(e.setRenderTarget(null),this._fsQuad.render(e)):(e.setRenderTarget(t),e.clear(),this._fsQuad.render(e)),this.scene.overrideMaterial=null,e.setClearColor(this._oldClearColor),e.setClearAlpha(r),e.autoClear=i}setSize(e,t){this.materialBokeh.uniforms.aspect.value=e/t,this._renderTargetDepth.setSize(e,t)}dispose(){this._renderTargetDepth.dispose(),this._materialDepth.dispose(),this.materialBokeh.dispose(),this._fsQuad.dispose()}},le=[`#1a2ffb`,`#1a2ffb`,`#f2f3f8`,`#f2f3f8`,`#0b0c12`],w=1.15,T=1/120;async function E(r,o,m){let{mobile:g,portrait:v}=m,y=m.dpr,S=g?2:3,C=new e({canvas:r,antialias:!1,powerPreference:`high-performance`});C.setPixelRatio(y),C.toneMapping=7,C.toneMappingExposure=1;let E=new ie;E.background=new h(`#05060c`),E.environment=await t(),E.environmentIntensity=.75;let D=new x(`#ffffff`,1.6);D.position.set(-6,10,12),E.add(D);let O=new x(`#8fa0ff`,1.4);O.position.set(10,-4,-8),E.add(O);let k=new ae(26,2,1,200);k.position.set(0,0,44);let ue=new h(`#c1ff00`),A=new l({roughness:.22,metalness:0,clearcoat:1,clearcoatRoughness:.06});A.onBeforeCompile=e=>{e.uniforms.uAccent={value:ue},e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
attribute float aAccent;
varying float vAccent;`).replace(`#include <begin_vertex>`,`#include <begin_vertex>
vAccent = aAccent;`),e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>
uniform vec3 uAccent;
varying float vAccent;`).replace(`#include <color_fragment>`,`#include <color_fragment>
diffuseColor.rgb = mix(diffuseColor.rgb, uAccent, vAccent);`)};let j=o.map(e=>se(e,g?`low`:`high`)),M=j.map(e=>{let t=new f(e.geometry,A,S);return t.instanceMatrix.setUsage(ne),t.frustumCulled=!1,t.userData.name=e.name,E.add(t),t}),de=7,N=()=>(de=de*16807%2147483647)/2147483647,P=[];j.forEach((e,t)=>{for(let n=0;n<S;n++){let r=.6+e.colliders.length*.12,i=Math.max(...e.colliders.map(e=>e.length()))+w;P.push({type:t,slot:n,p:new _(v?(N()-.5)*14:(N()-.5)*56,v?(N()-.5)*40:(N()-.5)*16,(N()-.5)*10),v:new _,q:new b().setFromEuler(new d(N()*6.3,N()*6.3,N()*6.3)),w:new _((N()-.5)*.6,(N()-.5)*.6,(N()-.5)*.6),m:r,invI:1/(.4*r*i*i),reach:i,phase:N()*100,world:e.colliders.map(()=>new _)}),M[t].setColorAt(n,new h(le[Math.floor(N()*le.length)]))}}),M.forEach(e=>e.instanceColor.needsUpdate=!0);let F=v?new _(2.2,.42,2.2):new _(.38,1.9,2.2),I=new _,L=!1,R=P.map(()=>new _),z=P.map(()=>new _),fe=new _,B=new _,V=new _,H=new _,U=new _,W=new _,G=new b,K=0,pe=e=>{let t=j[e.type].colliders;for(let n=0;n<t.length;n++)e.world[n].copy(t[n]).applyQuaternion(e.q).add(e.p)},q=(e,t,n)=>{R[e].add(t),B.copy(n).sub(P[e].p),z[e].add(fe.copy(B).cross(t))};function me(){K+=T;for(let e=0;e<P.length;e++){let t=P[e];pe(t),R[e].set(-F.x*t.p.x,-F.y*t.p.y,-F.z*t.p.z).multiplyScalar(t.m),R[e].addScaledVector(t.v,-1.6*t.m);let n=K+t.phase;R[e].x+=Math.sin(n*.5)*.8*t.m,R[e].y+=Math.cos(n*.37)*1.1*t.m,R[e].z+=Math.sin(n*.29)*.6*t.m,z[e].copy(t.w).multiplyScalar(-1.2/t.invI),z[e].x+=Math.sin(n*.21)*.25/t.invI,z[e].y+=Math.cos(n*.17)*.25/t.invI}for(let e=0;e<P.length;e++){let t=P[e];for(let n=e+1;n<P.length;n++){let r=P[n],i=t.reach+r.reach;if(!(t.p.distanceToSquared(r.p)>i*i))for(let i of t.world)for(let a of r.world){V.copy(i).sub(a);let o=V.lengthSq();if(o>=4*w*w||o<1e-8)continue;let s=Math.sqrt(o);V.divideScalar(s),H.copy(t.v).sub(r.v);let c=90*(2*w-s)-4*Math.min(0,H.dot(V));U.copy(i).add(a).multiplyScalar(.5),W.copy(V).multiplyScalar(c),q(e,W,U),q(n,W.negate(),U)}}}if(L){let e=7.5;for(let t=0;t<P.length;t++){let n=P[t];if(!(n.p.distanceTo(I)>e+n.reach))for(let r of n.world){V.set(r.x-I.x,r.y-I.y,(r.z-I.z)*.35);let i=V.length();if(i>=e||i<1e-6)continue;let a=1-i/e;q(t,V.normalize().multiplyScalar(260*a*a/n.world.length),r)}}}for(let e=0;e<P.length;e++){let t=P[e];t.v.addScaledVector(R[e],T/t.m),t.p.addScaledVector(t.v,T),t.w.addScaledVector(z[e],T*t.invI);let n=t.w.length();n>3&&t.w.multiplyScalar(3/n),G.set(t.w.x*T*.5,t.w.y*T*.5,t.w.z*T*.5,0).multiply(t.q),t.q.set(t.q.x+G.x,t.q.y+G.y,t.q.z+G.z,t.q.w+G.w).normalize()}}let he=new ee,ge=new _(1,1,1);function _e(){for(let e of P)M[e.type].setMatrixAt(e.slot,he.compose(e.p,e.q,ge));M.forEach(e=>e.instanceMatrix.needsUpdate=!0)}let ve=g?360:480;for(let e=0;e<ve;e++)me(),e%40==39&&await n();_e();let J=new s(C,new te(1,1,{type:p,samples:g?0:4}));J.addPass(new a(E,k));let Y=g?null:new ce(E,k,{focus:42,aperture:.0035,maxblur:.007});Y&&J.addPass(Y),J.addPass(new c);let ye=m.width,be=m.height;function X(e,t){e&&t&&(ye=e,be=t,C.setPixelRatio(y),C.setSize(e,t,!1),J.setPixelRatio(y),J.setSize(e,t),k.aspect=e/t,k.fov=v?34:k.aspect<1.2?26*Math.min(1.9,1.2/k.aspect):26,k.updateProjectionMatrix())}X(m.width,m.height);let Z=()=>J.render();await n(),await C.compileAsync(E,k),Z();let Q=new re,xe=new u,Se=new oe(new _(0,0,1),-3),$=0,Ce=i(`hero`,()=>{Y&&(Y.enabled=!1),y=1,X(ye,be)});return{resize(e,t){X(e,t),Z()},pointer(e){e?(Q.setFromCamera(xe.set(e[0],e[1]),k),L=!!Q.ray.intersectPlane(Se,I)):L=!1},click(e){Q.setFromCamera(xe.set(e[0],e[1]),k),M.forEach(e=>e.computeBoundingSphere());let t=Q.intersectObjects(M,!1)[0];if(!t||t.instanceId===void 0)return null;let n=P.find(e=>M[e.type]===t.object&&e.slot===t.instanceId);return n&&n.v.add(Q.ray.direction.clone().multiplyScalar(14)),t.object.userData.name},frame(e){Ce(e),$+=Math.min(e/1e3,1/20);let t=0;for(;$>=T&&t<4;)me(),$-=T,t++;_e(),Z()}}}async function D(e,t,n){let r=window.matchMedia(`(max-width: 760px)`).matches,i={mobile:r,portrait:e.clientWidth<e.clientHeight,dpr:Math.min(window.devicePixelRatio||1,r?1.5:1.75),width:e.clientWidth,height:e.clientHeight},a=document.createElement(`canvas`);a.className=`hero__gl`,a.setAttribute(`aria-hidden`,`true`),e.appendChild(a);let o=await E(a,t,i);a.classList.add(`is-ready`);let s=e.clientWidth,c=e.clientHeight;if(new ResizeObserver(()=>{(e.clientWidth!==s||e.clientHeight!==c)&&(s=e.clientWidth,c=e.clientHeight,o.resize(s,c))}).observe(e),n.reducedMotion)return;let l=t=>{let n=e.getBoundingClientRect();return[[(t.clientX-n.left)/n.width*2-1,-((t.clientY-n.top)/n.height)*2+1],n]};e.addEventListener(`pointermove`,e=>o.pointer(l(e)[0])),e.addEventListener(`pointerleave`,()=>o.pointer(null));let u=e.querySelector(`[data-hero-tag]`),d=0;e.addEventListener(`pointerdown`,e=>{let[t,n]=l(e),r=o.click(t);r&&u&&(u.textContent=r,u.style.transform=`translate(${e.clientX-n.left}px, ${e.clientY-n.top}px)`,u.classList.add(`is-on`),clearTimeout(d),d=window.setTimeout(()=>u.classList.remove(`is-on`),1400))});let f=!0;new IntersectionObserver(([e])=>f=e.isIntersecting,{rootMargin:`50px`}).observe(e),n.onTick((e,t)=>{f&&!document.hidden&&o.frame(t)})}export{D as initHero};