export const findMarkdownOffset = (content: string, selectedText: string, domOffset: number): number => {
  if (!selectedText) return domOffset;

  // Clean text for matching
  const targetText = selectedText.trim();

  // We need to find the occurrence in the markdown that most closely matches the DOM position
  // after accounting for potential markdown tags
  const escaped = targetText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regexSource = escaped.split('').map(char => {
    if (/\s/.test(char)) return '\\s+';
    return '[\\*_`~]*' + char + '[\\*_`~]*';
  }).join('');

  const regex = new RegExp(regexSource, 'g');
  let match;
  let bestMatchEnd = -1;
  let minDiff = Infinity;

  while ((match = regex.exec(content)) !== null) {
    const matchEnd = match.index + match[0].length;
    const diff = Math.abs(matchEnd - domOffset);
    if (diff < minDiff) {
      minDiff = diff;
      bestMatchEnd = matchEnd;
    }
  }

  return bestMatchEnd !== -1 ? bestMatchEnd : domOffset;
};

export const findAndAddMessage = (
  messages: any[],
  targetId: string,
  rawAnchorOffset: number,
  highlightedText: string,
  newMsg: any | null
): { list: any[]; found: boolean; subThreadId: string | null } => {
  let found = false;
  let subThreadId: string | null = null;

  const newList = messages.map(msg => {
    if (msg.id === targetId) {
      found = true;
      const subThreads = [...(msg.subThreads || [])];
      const content = msg.content;

      // 1. Get the precise end offset in raw markdown
      const anchorOffset = findMarkdownOffset(content, highlightedText, rawAnchorOffset);

      // 2. Find the start offset by searching backwards from the anchorOffset
      // This is more reliable than simple subtraction
      const escapedH = highlightedText.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const hRegexSource = escapedH.split('').map(char => (/\s/.test(char) ? '\\s+' : '[\\*_`~]*' + char + '[\\*_`~]*')).join('');
      const hRegex = new RegExp(hRegexSource, 'g');

      let hMatch;
      let hStart = Math.max(0, anchorOffset - highlightedText.length);
      let minHDiff = Infinity;
      while ((hMatch = hRegex.exec(content)) !== null) {
          const matchEnd = hMatch.index + hMatch[0].length;
          const diff = Math.abs(matchEnd - anchorOffset);
          // If the match ends exactly at our anchor or very close to it
          if (diff < minHDiff) {
              minHDiff = diff;
              hStart = hMatch.index;
          }
      }

      // 3. Determine injection point (end of sentence)
      const lookAhead = content.slice(anchorOffset);
      const sentenceEndMatch = lookAhead.match(/[.!?](\s+|$)/);
      const injectionPoint = sentenceEndMatch ? anchorOffset + sentenceEndMatch.index! + 1 : content.length;

      const existing = subThreads.find(st => st.anchorOffset === injectionPoint && st.highlightStart === hStart);

      if (existing) {
        subThreadId = existing.id;
        if (newMsg) {
          const idx = subThreads.indexOf(existing);
          subThreads[idx] = { ...existing, messages: [...existing.messages, newMsg] };
        }
      } else {
        subThreadId = crypto.randomUUID().slice(0, 8);
        subThreads.push({
          id: subThreadId,
          anchorOffset: injectionPoint,
          highlightStart: hStart,
          highlightedText: content.slice(hStart, anchorOffset), // Store the RAW markdown string including tags
          messages: newMsg ? [newMsg] : []
        });
      }
      return { ...msg, subThreads };
    }

    const subRes = findAndAddRecursiveInThreads(msg.subThreads || [], targetId, rawAnchorOffset, highlightedText, newMsg);
    if (subRes.found) {
      found = true;
      subThreadId = subRes.subThreadId;
      return { ...msg, subThreads: subRes.list };
    }
    return msg;
  });

  return { list: newList, found, subThreadId };
};

const findAndAddRecursiveInThreads = (threads: any[], targetId: string, anchorOffset: number, highlightedText: string, newMsg: any) => {
  let found = false;
  let subThreadId: string | null = null;
  const newList = threads.map(st => {
    const res = findAndAddMessage(st.messages, targetId, anchorOffset, highlightedText, newMsg);
    if (res.found) {
      found = true;
      subThreadId = res.subThreadId;
      return { ...st, messages: res.list };
    }
    return st;
  });
  return { list: newList, found, subThreadId };
};
