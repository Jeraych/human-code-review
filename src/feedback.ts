export function explainProblem(raw: string) {
  if (/another tab|Progress changed/i.test(raw))
    return {
      title: 'Your study changed in another tab',
      message:
        'Reload to continue from the latest saved progress. This tab will not overwrite the other tab’s work.',
    };
  if (/different frozen pool|missing frozen pool|unsupported saved|pool configuration/i.test(raw))
    return {
      title: 'This study needs its original examples',
      message:
        'Your saved responses are preserved. Download a recovery backup and ask the researcher to restore the matching pool before continuing.',
    };
  if (
    /restore backup|Backup requires|different progress|Response does not match|Invalid response/i.test(
      raw,
    )
  )
    return {
      title: 'This backup could not be restored',
      message: /different progress/i.test(raw)
        ? 'A session with different progress already exists. Keep both files for researcher review; nothing was replaced.'
        : 'Use a JSON result exported by this app, with its matching examples. Existing responses have not been replaced.',
    };
  if (/Reveal unavailable|Demo identit/i.test(raw))
    return {
      title: 'The reveal is unavailable',
      message:
        'Your choice is held on screen. Retry the reveal below; a successful retry counts your preference only once.',
    };
  if (/quota|SecurityError|save|local progress|storage/i.test(raw))
    return {
      title: 'Your browser could not save or open progress',
      message:
        'Keep this tab open for any unsaved choice. Download saved responses before reloading, and use a normal browser window with storage enabled.',
    };
  if (/frozen pool could|No comparisons|selected Play pool/i.test(raw))
    return {
      title: 'We could not load the comparisons',
      message: 'Check that the app server is running, then reload. Saved Study data is preserved.',
    };
  return {
    title: 'We could not complete that action',
    message:
      'Keep your current page open and download a recovery backup if you have Study responses. The details below can help the researcher resolve it.',
  };
}
