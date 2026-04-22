function createSvgElement(name: string, attrs: Record<string, string>): SVGElement {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attrs).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });
  return element;
}

export function createDeleteIcon(): SVGSVGElement {
  const svg = createSvgElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2.5",
  }) as SVGSVGElement;

  svg.appendChild(createSvgElement("line", { x1: "18", y1: "6", x2: "6", y2: "18" }));
  svg.appendChild(createSvgElement("line", { x1: "6", y1: "6", x2: "18", y2: "18" }));
  return svg;
}

export function setPasswordToggleIcon(icon: SVGElement, showMaskedIcon: boolean): void {
  const nextNodes = showMaskedIcon
    ? [
        createSvgElement("path", {
          d: "M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94",
        }),
        createSvgElement("path", {
          d: "M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19",
        }),
        createSvgElement("line", { x1: "1", y1: "1", x2: "23", y2: "23" }),
      ]
    : [
        createSvgElement("path", { d: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" }),
        createSvgElement("circle", { cx: "12", cy: "12", r: "3" }),
      ];

  icon.replaceChildren(...nextNodes);
}
