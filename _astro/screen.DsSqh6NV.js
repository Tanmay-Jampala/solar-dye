import{t as e}from"./three.module.DBn9wGL_.js";import{a as t,c as n,i as r,n as i,o as a,r as o,s,t as c}from"./OutputPass.tkvUsrU9.js";import{$ as ee,An as l,B as te,E as ne,F as re,J as ie,N as ae,P as u,Pn as d,R as oe,X as f,Y as p,_n as se,a as m,c as ce,cn as le,d as h,dn as ue,fn as de,i as g,jn as _,ln as v,lt as fe,mn as pe,n as me,o as y,on as he,ot as ge,pn as _e,ut as ve,w as ye,xn as b,z as be}from"./three.core.BeTNsWxX.js";var x={name:`LuminosityHighPassShader`,uniforms:{tDiffuse:{value:null},luminosityThreshold:{value:1},smoothWidth:{value:1},defaultColor:{value:new h(0)},defaultOpacity:{value:0}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform sampler2D tDiffuse;
		uniform vec3 defaultColor;
		uniform float defaultOpacity;
		uniform float luminosityThreshold;
		uniform float smoothWidth;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );

			float v = luminance( texel.xyz );

			vec4 outputColor = vec4( defaultColor.rgb, defaultOpacity );

			float alpha = smoothstep( luminosityThreshold, luminosityThreshold + smoothWidth, v );

			gl_FragColor = mix( outputColor, texel, alpha );

		}`},xe=class e extends a{constructor(e,n=1,r,i){super(),this.strength=n,this.radius=r,this.threshold=i,this.resolution=e===void 0?new l(256,256):new l(e.x,e.y),this.clearColor=new h(0,0,0),this.needsSwap=!1,this.renderTargetsHorizontal=[],this.renderTargetsVertical=[],this.nMips=5;let a=Math.round(this.resolution.x/2),o=Math.round(this.resolution.y/2);this.renderTargetBright=new d(a,o,{type:u,depthBuffer:!1}),this.renderTargetBright.texture.name=`UnrealBloomPass.bright`,this.renderTargetBright.texture.generateMipmaps=!1;for(let e=0;e<this.nMips;e++){let t=new d(a,o,{type:u,depthBuffer:!1});t.texture.name=`UnrealBloomPass.h`+e,t.texture.generateMipmaps=!1,this.renderTargetsHorizontal.push(t);let n=new d(a,o,{type:u,depthBuffer:!1});n.texture.name=`UnrealBloomPass.v`+e,n.texture.generateMipmaps=!1,this.renderTargetsVertical.push(n),a=Math.round(a/2),o=Math.round(o/2)}let c=x;this.highPassUniforms=b.clone(c.uniforms),this.highPassUniforms.luminosityThreshold.value=i,this.highPassUniforms.smoothWidth.value=.01,this.materialHighPassFilter=new v({uniforms:this.highPassUniforms,vertexShader:c.vertexShader,fragmentShader:c.fragmentShader}),this.separableBlurMaterials=[];let ee=[6,10,14,18,22];a=Math.round(this.resolution.x/2),o=Math.round(this.resolution.y/2);for(let e=0;e<this.nMips;e++)this.separableBlurMaterials.push(this._getSeparableBlurMaterial(ee[e])),this.separableBlurMaterials[e].uniforms.invSize.value=new l(1/a,1/o),a=Math.round(a/2),o=Math.round(o/2);this.compositeMaterial=this._getCompositeMaterial(this.nMips),this.compositeMaterial.uniforms.blurTexture1.value=this.renderTargetsVertical[0].texture,this.compositeMaterial.uniforms.blurTexture2.value=this.renderTargetsVertical[1].texture,this.compositeMaterial.uniforms.blurTexture3.value=this.renderTargetsVertical[2].texture,this.compositeMaterial.uniforms.blurTexture4.value=this.renderTargetsVertical[3].texture,this.compositeMaterial.uniforms.blurTexture5.value=this.renderTargetsVertical[4].texture,this.compositeMaterial.uniforms.bloomStrength.value=n,this.compositeMaterial.uniforms.bloomRadius.value=.1;let te=[1,.8,.6,.4,.2];this.compositeMaterial.uniforms.bloomFactors.value=te,this.bloomTintColors=[new _(1,1,1),new _(1,1,1),new _(1,1,1),new _(1,1,1),new _(1,1,1)],this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,this.copyUniforms=b.clone(s.uniforms),this.blendMaterial=new v({uniforms:this.copyUniforms,vertexShader:s.vertexShader,fragmentShader:s.fragmentShader,premultipliedAlpha:!0,blending:2,depthTest:!1,depthWrite:!1,transparent:!0}),this._oldClearColor=new h,this._oldClearAlpha=1,this._basic=new f,this._fsQuad=new t(null)}dispose(){for(let e=0;e<this.renderTargetsHorizontal.length;e++)this.renderTargetsHorizontal[e].dispose();for(let e=0;e<this.renderTargetsVertical.length;e++)this.renderTargetsVertical[e].dispose();this.renderTargetBright.dispose();for(let e=0;e<this.separableBlurMaterials.length;e++)this.separableBlurMaterials[e].dispose();this.compositeMaterial.dispose(),this.blendMaterial.dispose(),this._basic.dispose(),this._fsQuad.dispose()}setSize(e,t){let n=Math.round(e/2),r=Math.round(t/2);this.renderTargetBright.setSize(n,r);for(let e=0;e<this.nMips;e++)this.renderTargetsHorizontal[e].setSize(n,r),this.renderTargetsVertical[e].setSize(n,r),this.separableBlurMaterials[e].uniforms.invSize.value=new l(1/n,1/r),n=Math.round(n/2),r=Math.round(r/2)}render(t,n,r,i,a){t.getClearColor(this._oldClearColor),this._oldClearAlpha=t.getClearAlpha();let o=t.autoClear;t.autoClear=!1,t.setClearColor(this.clearColor,0),a&&t.state.buffers.stencil.setTest(!1),this.renderToScreen&&(this._fsQuad.material=this._basic,this._basic.map=r.texture,t.setRenderTarget(null),t.clear(),this._fsQuad.render(t)),this.highPassUniforms.tDiffuse.value=r.texture,this.highPassUniforms.luminosityThreshold.value=this.threshold,this._fsQuad.material=this.materialHighPassFilter,t.setRenderTarget(this.renderTargetBright),t.clear(),this._fsQuad.render(t);let s=this.renderTargetBright;for(let n=0;n<this.nMips;n++)this._fsQuad.material=this.separableBlurMaterials[n],this.separableBlurMaterials[n].uniforms.colorTexture.value=s.texture,this.separableBlurMaterials[n].uniforms.direction.value=e.BlurDirectionX,t.setRenderTarget(this.renderTargetsHorizontal[n]),t.clear(),this._fsQuad.render(t),this.separableBlurMaterials[n].uniforms.colorTexture.value=this.renderTargetsHorizontal[n].texture,this.separableBlurMaterials[n].uniforms.direction.value=e.BlurDirectionY,t.setRenderTarget(this.renderTargetsVertical[n]),t.clear(),this._fsQuad.render(t),s=this.renderTargetsVertical[n];this._fsQuad.material=this.compositeMaterial,this.compositeMaterial.uniforms.bloomStrength.value=this.strength,this.compositeMaterial.uniforms.bloomRadius.value=this.radius,this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,t.setRenderTarget(this.renderTargetsHorizontal[0]),t.clear(),this._fsQuad.render(t),this._fsQuad.material=this.blendMaterial,this.copyUniforms.tDiffuse.value=this.renderTargetsHorizontal[0].texture,a&&t.state.buffers.stencil.setTest(!0),this.renderToScreen?(t.setRenderTarget(null),this._fsQuad.render(t)):(t.setRenderTarget(r),this._fsQuad.render(t)),t.setClearColor(this._oldClearColor,this._oldClearAlpha),t.autoClear=o}_getSeparableBlurMaterial(e){let t=[],n=e/3;for(let r=0;r<e;r++)t.push(.39894*Math.exp(-.5*r*r/(n*n))/n);let r=[],i=[];for(let n=1;n<e;n+=2){let a=t[n],o=n+1<e?t[n+1]:0,s=a+o;r.push((n*a+(n+1)*o)/s),i.push(s)}return new v({defines:{KERNEL_PAIRS:r.length},uniforms:{colorTexture:{value:null},invSize:{value:new l(.5,.5)},direction:{value:new l(.5,.5)},centerWeight:{value:t[0]},gaussianOffsets:{value:r},gaussianWeights:{value:i}},vertexShader:`

				varying vec2 vUv;

				void main() {

					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

				}`,fragmentShader:`

				#include <common>

				varying vec2 vUv;

				uniform sampler2D colorTexture;
				uniform vec2 invSize;
				uniform vec2 direction;
				uniform float centerWeight;
				uniform float gaussianOffsets[KERNEL_PAIRS];
				uniform float gaussianWeights[KERNEL_PAIRS];

				void main() {

					vec3 diffuseSum = texture2D( colorTexture, vUv ).rgb * centerWeight;

					for ( int i = 0; i < KERNEL_PAIRS; i ++ ) {

						vec2 uvOffset = direction * invSize * gaussianOffsets[ i ];
						vec3 sample1 = texture2D( colorTexture, vUv + uvOffset ).rgb;
						vec3 sample2 = texture2D( colorTexture, vUv - uvOffset ).rgb;
						diffuseSum += ( sample1 + sample2 ) * gaussianWeights[ i ];

					}

					gl_FragColor = vec4( diffuseSum, 1.0 );

				}`})}_getCompositeMaterial(e){return new v({defines:{NUM_MIPS:e},uniforms:{blurTexture1:{value:null},blurTexture2:{value:null},blurTexture3:{value:null},blurTexture4:{value:null},blurTexture5:{value:null},bloomStrength:{value:1},bloomFactors:{value:null},bloomTintColors:{value:null},bloomRadius:{value:0}},vertexShader:`

				varying vec2 vUv;

				void main() {

					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

				}`,fragmentShader:`

				varying vec2 vUv;

				uniform sampler2D blurTexture1;
				uniform sampler2D blurTexture2;
				uniform sampler2D blurTexture3;
				uniform sampler2D blurTexture4;
				uniform sampler2D blurTexture5;
				uniform float bloomStrength;
				uniform float bloomRadius;
				uniform float bloomFactors[NUM_MIPS];
				uniform vec3 bloomTintColors[NUM_MIPS];

				float lerpBloomFactor( const in float factor ) {

					float mirrorFactor = 1.2 - factor;
					return mix( factor, mirrorFactor, bloomRadius );

				}

				void main() {

					// 3.0 for backwards compatibility with previous alpha-based intensity
					vec3 bloom = 3.0 * bloomStrength * (
						lerpBloomFactor( bloomFactors[ 0 ] ) * bloomTintColors[ 0 ] * texture2D( blurTexture1, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 1 ] ) * bloomTintColors[ 1 ] * texture2D( blurTexture2, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 2 ] ) * bloomTintColors[ 2 ] * texture2D( blurTexture3, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 3 ] ) * bloomTintColors[ 3 ] * texture2D( blurTexture4, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 4 ] ) * bloomTintColors[ 4 ] * texture2D( blurTexture5, vUv ).rgb
					);

					float bloomAlpha = max( bloom.r, max( bloom.g, bloom.b ) );
					gl_FragColor = vec4( bloom, bloomAlpha );

				}`})}};xe.BlurDirectionX=new l(1,0),xe.BlurDirectionY=new l(0,1);var Se=-20,Ce=-420,we=14,S=-480,Te=-600,C=-770,w=[`#ff4c41`,`#ff9a3c`,`#ffe14d`,`#c1ff00`,`#3ce0ff`,`#4d63ff`,`#8832f7`].map(e=>new h(e));function Ee(e,t){let n=Math.min(.9999,Math.max(0,e))*(w.length-1),r=Math.floor(n);return t.copy(w[r]).lerp(w[r+1],n-r)}var T=e=>e*e*(3-2*e),E=e=>Math.min(1,Math.max(0,e)),D=(e,t,n)=>e+(t-e)*n;function O(e){let t=Math.sin(e*127.1+311.7)*43758.5453;return t-Math.floor(t)}async function k(t,a,s,u){let d=window.matchMedia(`(max-width: 760px)`).matches,[b,x]=await Promise.all([fetch(`${s}data/web_qm9_points.json`).then(e=>e.json()),fetch(`${s}data/results.json`).then(e=>e.json())]),w=document.createElement(`canvas`);w.setAttribute(`aria-hidden`,`true`),a.appendChild(w);let k=new e({canvas:w,antialias:!1,powerPreference:`high-performance`}),De=Math.min(window.devicePixelRatio||1,d?1:1.5);k.setPixelRatio(De),k.toneMapping=7;let A=new le;A.background=new h(`#000000`);let j=new ge(60,1,.1,1200),Oe=new v({uniforms:{uTime:{value:0}},vertexShader:`
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,fragmentShader:`
      uniform float uTime; varying vec3 vN; varying vec3 vV;
      void main() {
        float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        vec3 col = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + f * 1.3 + uTime * 0.04));
        gl_FragColor = vec4(col * (0.12 + 0.75 * f), 1.0);
      }`}),ke=new p(new se(12,.32,32,160),Oe);A.add(ke);let Ae=new p(new se(15,.12,12,160),Oe);Ae.position.z=-6,A.add(Ae);let je=b.gap_eV.length,Me=[];for(let e=0;e<je;e++)(!d||b.stage[e]>0||e%4==0)&&Me.push(e);let Ne=[...b.gap_eV].sort((e,t)=>e-t),Pe=Ne[Math.floor(je*.02)],Fe=Ne[Math.floor(je*.98)],M=Me.length,Ie=new Float32Array(M*3),Le=new Float32Array(M*3),Re=new Float32Array(M),ze=new Float32Array(M),Be=new Float32Array(M*3),N=new h,P=[];Me.forEach((e,t)=>{let n=O(e)*Math.PI*2,r=we*(.92+O(e+7)*.16);Ie.set([Math.cos(n)*r,Math.sin(n)*r,D(Se,Ce,O(e+3))],t*3),Ee((b.gap_eV[e]-Pe)/(Fe-Pe),N),Le.set([N.r,N.g,N.b],t*3),Re[t]=b.stage[e],ze[t]=O(e+11),b.stage[e]===4&&P.push(t)});let Ve=x.model.screening.target_gap_eV,He=x.model.top_candidates.slice(0,P.length),Ue=x.model.screening.closest_predicted_gap_eV,We=d?3.2:7,F=d?-2.5:-6,Ge=He.map(e=>e.predicted_gap_eV).sort((e,t)=>e-t);P.forEach((e,t)=>{let n=Ge[Math.min(t,Ge.length-1)];Be.set([F+(n-Ve)*We,(t-(P.length-1)/2)*1.6,S],e*3)});let I=new y;I.setAttribute(`position`,new m(Ie,3)),I.setAttribute(`color`,new m(Le,3)),I.setAttribute(`aStage`,new m(Re,1)),I.setAttribute(`aSeed`,new m(ze,1)),I.setAttribute(`aTarget`,new m(Be,3));let L={uStage:{value:0},uFly:{value:0},uTime:{value:0},uSize:{value:(d?1.6:1.25)*De}},Ke=new v({uniforms:L,transparent:!0,depthWrite:!1,blending:2,vertexShader:`
      attribute float aStage; attribute float aSeed; attribute vec3 aTarget; attribute vec3 color;
      uniform float uStage; uniform float uFly; uniform float uTime; uniform float uSize;
      varying vec3 vColor; varying float vAlpha;
      void main() {
        vec3 p = position;
        float fade = clamp(uStage - aStage, 0.0, 1.0);
        // failing points fall away and drift outward
        p.y -= fade * fade * (26.0 + aSeed * 30.0);
        p.xy *= 1.0 + fade * 0.35;
        float survivor = step(3.5, aStage);
        float fly = survivor * uFly;
        p = mix(p, aTarget, fly * fly * (3.0 - 2.0 * fly));
        p.y += sin(uTime * 1.3 + aSeed * 20.0) * 0.15;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float grow = 1.0 + aStage * aStage * 0.22 * smoothstep(0.5, 4.0, uStage);
        gl_PointSize = min(uSize * grow * (220.0 / -mv.z), 28.0 * uSize);
        float depth = smoothstep(150.0, 20.0, -mv.z);
        // thin the crowd: early on most points are faint, the brightness goes to the survivors
        float base = mix(0.32, 1.0, smoothstep(0.5, 3.0, uStage));
        vAlpha = (1.0 - fade) * max(depth * base, survivor * 0.9);
        vColor = mix(color, vec3(1.0), survivor * smoothstep(3.0, 4.0, uStage) * 0.6);
        gl_Position = projectionMatrix * mv;
      }`,fragmentShader:`
      varying vec3 vColor; varying float vAlpha;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = length(d);
        if (r > 0.5) discard;
        float a = smoothstep(0.5, 0.1, r) * vAlpha;
        gl_FragColor = vec4(vColor * a, a);
      }`}),qe=new fe(I,Ke);qe.frustumCulled=!1,A.add(qe);let Je=new y().setFromPoints(Array.from({length:97},(e,t)=>new _(Math.cos(t/96*Math.PI*2),Math.sin(t/96*Math.PI*2),0))),Ye=[`#3ce0ff`,`#ff4c41`,`#ff9a3c`];for(let e=Se,t=0;e>Ce;e-=22,t++){let n=new oe(Je,new be({color:Ye[t%3],transparent:!0,opacity:.45}));n.scale.setScalar(15.2+t%2*.8),n.position.z=e,n.rotation.z=t*.3,A.add(n)}let Xe=[];for(let e=0;e<12;e++){let t=e/12*Math.PI*2;Xe.push(new _(Math.cos(t)*15.6,Math.sin(t)*15.6,Se)),Xe.push(new _(Math.cos(t)*15.6,Math.sin(t)*15.6,Ce))}A.add(new te(new y().setFromPoints(Xe),new be({color:`#3ce0ff`,transparent:!0,opacity:.25})));let R=new f({color:`#ffffff`,toneMapped:!1}),Ze=new f({color:`#ff4c41`,toneMapped:!1,transparent:!0}),z=new p(new se(2.2,.12,16,96),R);z.position.set(F,0,S),A.add(z);let B=new p(new g(1,.22,.22),Ze);B.position.set(F,-3.6,S),A.add(B);let Qe=(Ue-Ve)*We,V=x.quantum_dots.brus_curve,$e=x.quantum_dots.target_gap_eV,H=x.quantum_dots.radius_at_optimum_nm.PbS,et=V.PbS.radius_nm[0],tt=V.PbS.radius_nm[V.PbS.radius_nm.length-1],nt=d?9:20,rt=3.6,U=d?14:12,W=e=>D(-nt,nt,(e-et)/(tt-et)),it=e=>(Math.min(e,rt)-$e)/(rt-$e)*U,G=new ae;G.position.z=Te,A.add(G);let at=new ue(1,20,14);[`CdSe`,`PbS`].forEach((e,t)=>{let n=V[e],r=n.radius_nm.map((e,t)=>t).filter(e=>e%10==0),i=new re(at,new f({toneMapped:!1}),r.length),a=new ie;r.forEach((e,r)=>{let o=n.radius_nm[e],s=.08+o*(d?.035:.05);a.makeScale(s,s,s).setPosition(W(o),it(n.gap_eV[e]),t*-4),i.setMatrixAt(r,a);let c=n.rgb[e];i.setColorAt(r,c?new h().setRGB(c[0],c[1],c[2],he):new h(`#2a2a3a`))}),G.add(i)});let ot=new p(new g(nt*2+4,.08,.08),R);G.add(ot);let st=new g(.08,U+2,.08),ct=new p(st,R);ct.position.set(W(H.brus_nm),U/2-2,-4);let lt=new p(st,new f({color:`#c1ff00`,toneMapped:!1}));lt.position.set(W(H.experimental_sizing_curve_nm),U/2-2,-4);let ut=new p(new g(Math.abs(W(H.brus_nm)-W(H.experimental_sizing_curve_nm)),.25,.25),Ze);ut.position.set((W(H.brus_nm)+W(H.experimental_sizing_curve_nm))/2,-2.2,-4),G.add(ct,lt,ut);let dt=x.quantum_dots.sq_placement.hopv_experimental.points,ft=x.quantum_dots.sq_placement.curve,K=d?9:22,pt=d?13:11,mt=e=>D(-K,K,(e-1)/2),q=e=>D(-pt,pt,e/.36),ht=new ae,gt=[];ft.gap_eV.forEach((e,t)=>e>=1&&e<=3&&gt.push(new _(mt(e),q(ft.efficiency[t]),C)));let _t=new oe(new y().setFromPoints(gt),new be({color:`#ffffff`,transparent:!0,opacity:.8})),vt=new p(new g(K*2,.05,.05),R);vt.position.set(0,q(0),C),ht.add(_t,vt);let yt=new pe(d?.45:.55);yt.scale(1,1,.25);let bt=new ee({color:`#cfe0ff`,roughness:.08,metalness:.2,iridescence:1,emissive:`#1a2ffb`,emissiveIntensity:.6}),J=new re(yt,bt,dt.length);J.frustumCulled=!1,ht.add(J),A.add(ht),A.add(new me(`#ffffff`,.6));let xt=new ye(`#ffffff`,2.2);xt.position.set(5,10,8),A.add(xt);let St=Math.ceil(Math.sqrt(dt.length)),Ct=dt.map((e,t)=>{let n=new _((t%St/(St-1)-.5)*K*.9,(Math.floor(t/St)/(St-1)-.5)*pt*1.2,-762),r=new _(O(t)-.5,O(t+1)-.5,O(t+2)*.6).normalize();return{pane:n,burst:n.clone().addScaledVector(r,14+O(t+5)*12),onSq:new _(mt(e.gap_eV),q(e.sq_efficiency),-769.8),onPce:new _(mt(e.gap_eV),q(e.measured_pce),-769.8),spin:new _(O(t+8)*6,O(t+9)*6,O(t+10)*6)}}),wt=new h,Tt=new h(`#ff4c41`),Et=new h(`#ffffff`),Dt=new ve,Ot=new ne,kt=new _,At=new _(1,1,1),jt=new ie;function Mt(e){let t=T(E(e/.25)),n=T(E((e-.28)/.3)),r=T(E((e-.62)/.25));Ct.forEach((e,i)=>{kt.lerpVectors(e.pane,e.burst,t).lerp(e.onSq,n).lerp(e.onPce,r);let a=t*(1-n);Ot.set(e.spin.x*a,e.spin.y*a,e.spin.z*a+(1-a)*0),Dt.setFromEuler(Ot),jt.compose(kt,Dt,At),J.setMatrixAt(i,jt),J.setColorAt(i,wt.copy(Et).lerp(Tt,r)),bt.emissiveIntensity=.6*(1-r)+.1}),J.instanceMatrix.needsUpdate=!0,J.instanceColor.needsUpdate=!0}let Nt=document.createElement(`canvas`);Nt.width=Nt.height=128;let Pt=Nt.getContext(`2d`),Ft=Pt.createRadialGradient(64,64,0,64,64,64);Ft.addColorStop(0,`rgba(255,255,255,1)`),Ft.addColorStop(.25,`rgba(200,230,255,0.7)`),Ft.addColorStop(1,`rgba(26,47,251,0)`),Pt.fillStyle=Ft,Pt.fillRect(0,0,128,128);let It=new ce(Nt),Lt=new de(new _e({map:It,blending:2,depthWrite:!1,transparent:!0}));Lt.scale.setScalar(5),A.add(Lt);let Y=new o(k);Y.addPass(new i(A,j));let Rt=new xe(new l(256,256),d?.5:.6,.35,.3);Y.addPass(Rt);let zt=new r({uniforms:{tDiffuse:{value:null},uAmount:{value:.004}},vertexShader:`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,fragmentShader:`
      uniform sampler2D tDiffuse; uniform float uAmount; varying vec2 vUv;
      void main() {
        vec2 d = vUv - 0.5;
        vec2 off = d * uAmount * (0.5 + dot(d, d) * 6.0);
        vec4 c = texture2D(tDiffuse, vUv);
        c.r = texture2D(tDiffuse, vUv + off).r;
        c.b = texture2D(tDiffuse, vUv - off).b;
        c.rgb *= 1.0 - 0.55 * dot(d, d) * 2.0; // vignette keeps the overlaid text readable
        gl_FragColor = c;
      }`});Y.addPass(zt),Y.addPass(new c);function Bt(){let e=a.clientWidth,t=a.clientHeight;e&&t&&(k.setSize(e,t,!1),Y.setPixelRatio(De),Y.setSize(e,t),Rt.resolution.set(e/2,t/2),j.aspect=e/t,j.fov=e<t?72:60,j.updateProjectionMatrix())}Bt(),new ResizeObserver(Bt).observe(a);let X=e=>t.querySelector(e),Vt=(e,t)=>{if(!e)return NaN;let n=e.getBoundingClientRect();return n.top+window.scrollY+n.height*t},Z=[],Q=[],Ht=0,Ut=1,Wt=0,Gt=1;function $(){let e=window.innerHeight,n=(t,n)=>Vt(t,n)-e/2,r=X(`.scr__statement`),i=X(`[data-beat="funnel"]`),a=X(`[data-beat="honest"] [data-gl-gap]`),o=X(`[data-beat="dots"] [data-gl-gap]`),s=X(`[data-beat="hopv"] [data-gl-gap]`),c=X(`[data-beat="ood"]`);Z=[{s:t.getBoundingClientRect().top+window.scrollY-e,x:0,y:4,z:70},{s:n(r,.5),x:0,y:0,z:26},{s:n(i,0),x:0,y:0,z:-16},{s:n(i,1),x:0,y:0,z:-390},{s:n(a,.3),x:d?1:3,y:0,z:S+(d?30:22)},{s:n(a,.8),x:d?1:3,y:0,z:S+(d?28:20)},{s:n(o,.2),x:0,y:2,z:Te+(d?46:36)},{s:n(o,.8),x:0,y:2,z:Te+(d?44:34)},{s:n(s,.1),x:0,y:0,z:C+(d?42:32)},{s:n(s,.9),x:0,y:0,z:C+(d?40:30)},{s:n(c,.5),x:0,y:0,z:-890}].filter(e=>Number.isFinite(e.s)),Q=Array.from(t.querySelectorAll(`.scr__funnel li`)).map((e,t)=>({s:n(e,.5),v:t})),Ht=n(i,1),Ut=n(a,.25),Wt=n(s,0)-e*.2,Gt=n(s,.85)}$(),window.addEventListener(`load`,$),document.fonts?.ready.then($),new ResizeObserver($).observe(t);let Kt=e=>{if(e<=Z[0].s)return Z[0];for(let t=1;t<Z.length;t++)if(e<=Z[t].s){let n=Z[t-1],r=Z[t],i=(e-n.s)/Math.max(1,r.s-n.s),a=t===3?i:T(i);return{s:e,x:D(n.x,r.x,a),y:D(n.y,r.y,a),z:D(n.z,r.z,a)}}return Z[Z.length-1]},qt=e=>{if(!Q.length||e<=Q[0].s)return 0;for(let t=1;t<Q.length;t++)if(e<=Q[t].s)return D(Q[t-1].v,Q[t].v,(e-Q[t-1].s)/Math.max(1,Q[t].s-Q[t-1].s));return Q[Q.length-1].v},Jt=!1;new IntersectionObserver(([e])=>Jt=e.isIntersecting,{rootMargin:`100px`}).observe(t);let Yt=new _,Xt=n(`screen`,()=>{Rt.enabled=!1,De=1,k.setPixelRatio(1),Bt()});u.onTick((e,t)=>{if(!Jt||document.hidden)return;Xt(t);let n=window.scrollY,r=Kt(n);j.position.set(r.x,r.y,r.z),Yt.set(r.x*.6,r.y*.5,r.z-40),j.lookAt(Yt);let i=qt(n);L.uStage.value=i,L.uFly.value=E((n-Ht)/Math.max(1,Ut-Ht)),L.uTime.value=e,Oe.uniforms.uTime.value=e,ke.rotation.z=e*.05,Ae.rotation.z=-e*.03;let a=L.uFly.value,o=T(E((a-.75)/.25));B.scale.x=Math.max(.001,Qe*o),B.position.x=F+Qe*o/2,Ze.opacity=1,Mt(E((n-Wt)/Math.max(1,Gt-Wt)));let s=(e,t)=>Math.max(.001,T(E((e-r.z)/t)));z.visible=B.visible=r.z>-486,z.scale.setScalar(s(-360,60)),G.scale.setScalar(s(-476,50)),G.visible=r.z>-606,ht.visible=r.z<-590;let c=E((r.z-26)/44);Lt.position.set(Math.sin(e*.8)*.6,D(0,12,c)+Math.sin(e*1.1)*.3,r.z-22),Lt.material.opacity=1-E((i-3.2)/.8);let ee=+(r.z<Se&&r.z>Ce);zt.uniforms.uAmount.value=.004+ee*.012,Y.render()})}export{k as initScreen};