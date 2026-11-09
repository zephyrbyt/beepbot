"""Copies the robot's spoken phrases (reminders, alarms, and clearer weather answers) into custom_sentences/en.

Home Assistant only reads phrases from that folder, so the integration keeps its own copies there, marked on the
first line. A marked file is replaced when the integration updates. A file of the same name without the mark (an
older hand-installed copy, or one you've changed and taken the mark off) is never touched.
"""
from __future__ import annotations

import logging
from pathlib import Path

MARK = '# Managed by the Beepbot integration: replaced when it updates. Delete this line to keep your own changes.'
SOURCE = Path(__file__).parent / 'sentences'
_LOGGER = logging.getLogger(__name__)


def _ours(path: Path) -> bool:
    try:
        with path.open(encoding='utf-8') as file:
            return file.readline().rstrip('\r\n') == MARK
    except OSError:
        return False


def install(config_dir: str) -> list[str]:
    """Returns the files written. Runs in the executor (it touches the disk)."""
    written = []
    for source in sorted(SOURCE.glob('*/*.yaml')):
        target = Path(config_dir) / 'custom_sentences' / source.parent.name / source.name
        content = MARK + '\n' + source.read_text(encoding='utf-8')
        if target.exists():
            if not _ours(target):
                _LOGGER.warning('Beepbot: %s was not made by this integration, so it is left as it is. Delete it '
                                'to get the phrases that come with each update.', target.relative_to(config_dir))
                continue
            if target.read_text(encoding='utf-8') == content:
                continue
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_name(target.name + '.echo-tmp')
        temporary.write_text(content, encoding='utf-8')
        temporary.replace(target)
        written.append(str(target.relative_to(config_dir)))
    if written:
        _LOGGER.info('Beepbot phrases updated: %s', ', '.join(written))
    return written


def remove(config_dir: str) -> list[str]:
    removed = []
    for source in sorted(SOURCE.glob('*/*.yaml')):
        target = Path(config_dir) / 'custom_sentences' / source.parent.name / source.name
        if _ours(target):
            target.unlink()
            removed.append(str(target.relative_to(config_dir)))
    return removed
