// The dataTransfer MIME the palette tags a dragged resource with, read back by
// the canvas drop handler. A custom type (not text/plain) so the canvas only
// reacts to our own drags, never arbitrary text dropped onto the pane.
export const RESOURCE_DND_MIME = 'application/calco-resource';
