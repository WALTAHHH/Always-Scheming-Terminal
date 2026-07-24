// JSON tokenization for syntax highlighting
function tokenizeJson(json: string): { type: string; value: string }[] {
  const tokens: { type: string; value: string }[] = [];
  const re = /(\"(?:[^\"\\]|\\.)*\")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}\[\]:,])|\s+/g;
  let match;
  while ((match = re.exec(json)) !== null) {
    if (match[1]) tokens.push({ type: "string", value: match[1] });
    else if (match[2]) tokens.push({ type: "number", value: match[2] });
    else if (match[3]) tokens.push({ type: "keyword", value: match[3] });
    else if (match[4]) tokens.push({ type: "punct", value: match[4] });
    else tokens.push({ type: "ws", value: match[0] });
  }
  return tokens;
}

function determineTokenTypes(tokens: { type: string; value: string }[]) {
  const typedTokens = [...tokens];
  for (let i = 0; i < typedTokens.length; i++) {
    const token = typedTokens[i];
    if (token.type === "string") {
      // Check if this string is a key: next non-ws token is ":"
      let j = i + 1;
      while (j < typedTokens.length && typedTokens[j].type === "ws") j++;
      if (j < typedTokens.length && typedTokens[j].value === ":") {
        token.type = "key";
      }
    }
  }
  return typedTokens;
}

function colorClass(token: { type: string; value: string }): string {
  switch (token.type) {
    case "key": return "text-ast-accent";
    case "string": return "text-ast-mint";
    case "number": return "text-ast-gold";
    case "keyword":
      if (token.value === "true") return "text-ast-mint";
      if (token.value === "false") return "text-ast-pink";
      return "text-ast-muted"; // null
    case "punct": return "text-ast-muted";
    default: return "text-ast-text";
  }
}

export function renderJson(json: string): React.ReactNode[] {
  try {
    const tokens = tokenizeJson(json);
    const typedTokens = determineTokenTypes(tokens);
    const spans: React.ReactNode[] = [];
    for (let i = 0; i < typedTokens.length; i++) {
      const token = typedTokens[i];
      spans.push(
        <span key={i} className={colorClass(token)}>
          {token.value}
        </span>
      );
    }
    return spans;
  } catch (err) {
    // fallback to plain text
    return [<span key="fallback" className="text-ast-text">{json}</span>];
  }
}