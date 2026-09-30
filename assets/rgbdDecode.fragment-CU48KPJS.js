import{E as e}from"./index-BHs9XJxV.js";import{t}from"./helperFunctions-mRVb90D-.js";var n=`rgbdDecodePixelShader`,r=`varying vec2 vUV;uniform sampler2D textureSampler;
#include<helperFunctions>
#define CUSTOM_FRAGMENT_DEFINITIONS
void main(void) 
{gl_FragColor=vec4(fromRGBD(texture2D(textureSampler,vUV)),1.0);}`;e.ShadersStore[n]||(e.ShadersStore[n]=r);var i=[t];for(let t of i)e.IncludesShadersStore[t.name]||(e.IncludesShadersStore[t.name]=t.shader);var a={name:n,shader:r};export{a as rgbdDecodePixelShader};