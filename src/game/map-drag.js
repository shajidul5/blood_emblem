export function attachMapDrag(element, { canPan, onStart, onPan, onEnd }) {
  let gesture = null;
  let suppressClick = false;
  const pointers = new Set();

  function finish() {
    if (!gesture) return;
    const { id, dragging } = gesture;
    gesture = null;
    if (element.hasPointerCapture(id)) element.releasePointerCapture(id);
    if (dragging) onEnd();
  }

  element.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !canPan()) return;
    pointers.add(event.pointerId);
    element.setPointerCapture(event.pointerId);
    if (pointers.size > 1) {
      suppressClick = true;
      finish();
      return;
    }
    suppressClick = false;
    gesture = {
      id: event.pointerId, startX: event.clientX, startY: event.clientY,
      x: event.clientX, y: event.clientY, dragging: false,
    };
  });

  element.addEventListener('pointermove', (event) => {
    if (!gesture || gesture.id !== event.pointerId) return;
    if (!canPan()) {
      suppressClick = true;
      finish();
      return;
    }
    const distance = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY);
    if (!gesture.dragging && distance < 8) return;
    if (!gesture.dragging) {
      gesture.dragging = true;
      suppressClick = true;
      onStart();
    }
    event.preventDefault();
    onPan(gesture.x, gesture.y, event.clientX, event.clientY);
    gesture.x = event.clientX;
    gesture.y = event.clientY;
  });

  const release = (event) => {
    pointers.delete(event.pointerId);
    if (gesture?.id === event.pointerId) finish();
    else if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
  };
  element.addEventListener('pointerup', release);
  element.addEventListener('pointercancel', (event) => {
    suppressClick = true;
    release(event);
  });
  element.addEventListener('lostpointercapture', (event) => {
    pointers.delete(event.pointerId);
    if (gesture?.id === event.pointerId) {
      suppressClick = true;
      finish();
    }
  });
  element.addEventListener('click', (event) => {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  return () => {
    if (!gesture) return;
    suppressClick = true;
    finish();
  };
}
