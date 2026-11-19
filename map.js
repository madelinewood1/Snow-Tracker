function decode(topology) {
  const {arcs, transform} = topology;
  const lines = arcs.map(arc => {
    let x = 0, y = 0;
    const points = arc.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return [x * transform.scale[0] + transform.translate[0],
        y * transform.scale[1] + transform.translate[1]];
    });
    return points.filter((point, index) => index === 0 || index === points.length - 1 || index % 3 === 0);
  });
  const ring = segments => segments.flatMap((segment, index) => {
    const points = segment < 0 ? [...lines[~segment]].reverse() : lines[segment];
    return index ? points.slice(1) : points;
  });
  return topology.objects.states.geometries.map(state => ({
    id: state.id,
    outlines: (state.type === 'Polygon' ? [state.arcs] : state.arcs)
      .flatMap(polygon => polygon.map(ring)),
  }));
}

const colors = ['#314764', '#527a9f', '#63aac9', '#8de1ea', '#d4f8ff'];
function shade(value) {
  if (value === null) return '#29364c';
  const inches = value / 2.54;
  return colors[inches === 0 ? 0 : inches < 1 ? 1 : inches < 3 ? 2 : inches < 6 ? 3 : 4];
}

export async function createMap(canvas, stateIds, onSelect, onHover) {
  const response = await fetch('./states.json');
  if (!response.ok) throw new Error('State boundaries could not load');
  const geography = decode(await response.json()).filter(state => stateIds.includes(state.id));
  const context = canvas.getContext('2d');
  let view = {tilt: 0.28, rotation: 0, zoom: 1};
  let selected, values = new Map(), paths = [];
  let width, height, drag, frame;

  function draw() {
    const scale = Math.min(width / 1020, height / 690) * view.zoom;
    const cosine = Math.cos(view.rotation), sine = Math.sin(view.rotation);
    const project = (x, y, z) => {
      x -= 487;
      y -= 295;
      const vertical = (x * sine + y * cosine) * Math.cos(view.tilt);
      const perspective = 1 + vertical * Math.sin(view.tilt) / 1500;
      return [width / 2 + (x * cosine - y * sine) * scale * perspective,
        height / 2 + (vertical * perspective - z * Math.sin(view.tilt)) * scale];
    };
    const makePath = (outlines, z) => {
      const path = new Path2D();
      for (const outline of outlines) {
        outline.forEach(([x, y], index) => {
          const point = project(x, y, z);
          if (index) path.lineTo(...point);
          else path.moveTo(...point);
        });
        path.closePath();
      }
      return path;
    };

    context.clearRect(0, 0, width, height);
    paths = geography.map(state => {
      const snow = values.get(state.id) ?? null;
      const depth = 19 + Math.min(85, (snow ?? 0) * 2) + (state.id === selected ? 13 : 0);
      return {...state, depth, snow};
    }).sort((a, b) => a.depth - b.depth);
    for (let level = 0; level < Math.max(...paths.map(state => state.depth)); level += 9) {
      context.fillStyle = level < 10 ? '#0c1627' : '#293d57';
      for (const state of paths) {
        if (state.depth > level) context.fill(makePath(state.outlines, level), 'evenodd');
      }
    }
    for (const state of paths) {
      state.path = makePath(state.outlines, state.depth);
      const active = state.id === selected;
      context.fillStyle = shade(state.snow);
      context.strokeStyle = active ? '#a5eef2' : '#7289a4';
      context.lineWidth = active ? 2.5 : 0.63;
      context.fill(state.path, 'evenodd');
      context.stroke(state.path);
    }
  }

  function render() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(draw);
  }

  function hit(x, y) {
    const ratio = window.devicePixelRatio || 1;
    return [...paths].reverse().find(state => context.isPointInPath(state.path,
      x * ratio, y * ratio, 'evenodd'))?.id;
  }

  new ResizeObserver(() => {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    render();
  }).observe(canvas);

  canvas.addEventListener('pointerdown', event => {
    drag = {x: event.clientX, y: event.clientY, moved: false, ...view};
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (drag) {
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      drag.moved ||= Math.hypot(dx, dy) > 5;
      if (drag.moved) {
        onHover();
        view.rotation = Math.max(-0.65, Math.min(0.65, drag.rotation + dx / 420));
        view.tilt = Math.max(0, Math.min(1.02, drag.tilt + dy / 230));
        render();
        return;
      }
    }
    const id = hit(event.offsetX, event.offsetY);
    onHover(id, event.offsetX, event.offsetY);
    canvas.style.cursor = id ? 'pointer' : 'grab';
  });
  canvas.addEventListener('pointerup', event => {
    if (drag && !drag.moved) {
      const id = hit(event.offsetX, event.offsetY);
      if (id) onSelect(id);
    }
    drag = undefined;
  });
  canvas.addEventListener('pointercancel', () => { drag = undefined; onHover(); });
  canvas.addEventListener('pointerleave', () => onHover());
  return {
    update(id, snow) { selected = id; values = snow; render(); },
    zoom(amount) { view.zoom = Math.max(0.8, Math.min(1.65, view.zoom + amount)); render(); },
    tilt(amount) { view.tilt = Math.max(0, Math.min(1.02, view.tilt + amount)); render(); },
    reset() { view = {tilt: 0.28, rotation: 0, zoom: 1}; render(); },
  };
}
