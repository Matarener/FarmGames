varying mediump vec2 var_texcoord0;
varying mediump vec4 var_tint;

uniform lowp sampler2D texture_sampler;

void main()
{
	gl_FragColor = texture2D(texture_sampler, var_texcoord0.xy) * var_tint;
}
