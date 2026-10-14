// Placeholder shown wherever a member has no photo yet: a blue circle with a white figure.
export const NO_PHOTO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs>
<radialGradient id="bg" cx="0.3" cy="0.3" r="0.9"><stop offset="0" stop-color="#5ad8f7"/><stop offset="0.55" stop-color="#4aa3e6"/><stop offset="1" stop-color="#3b6fd1"/></radialGradient>
<radialGradient id="fg" cx="0.4" cy="0.35" r="0.8"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#dcdcdc"/></radialGradient>
<clipPath id="c"><circle cx="50" cy="50" r="50"/></clipPath>
</defs>
<g clip-path="url(#c)">
<rect width="100" height="100" fill="url(#bg)"/>
<circle cx="50" cy="37" r="17" fill="url(#fg)"/>
<path d="M14 100c2-24 17-38 36-38s34 14 36 38z" fill="url(#fg)"/>
</g>
</svg>`;

export const NO_PHOTO_DATA_URL = `data:image/svg+xml;base64,${Buffer.from(NO_PHOTO_SVG).toString("base64")}`;
