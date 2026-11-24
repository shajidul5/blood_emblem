const pendingResumes = new WeakMap();
const RESUME_TIMEOUT_MS = 2000;

export function resumeAudioContext(context) {
  if (pendingResumes.has(context)) return pendingResumes.get(context);
  if (context.state === 'running') return Promise.resolve();
  const resume = (async () => {
    let timer;
    try {
      await Promise.race([
        context.resume(),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(
            'Audio device did not resume. Audio will be recreated on the next click or keypress.',
          )), RESUME_TIMEOUT_MS);
        }),
      ]);
      if (context.state !== 'running') throw new Error(`Audio resumed in unexpected state: ${context.state}.`);
    } catch (error) {
      // A device failure can leave resume() pending forever on an unusable context.
      if (context.state !== 'closed') {
        try {
          await context.close();
        } catch (closeError) {
          console.error('Could not release the failed audio context:', closeError);
        }
      }
      throw error;
    } finally {
      clearTimeout(timer);
      pendingResumes.delete(context);
    }
  })();
  pendingResumes.set(context, resume);
  return resume;
}
