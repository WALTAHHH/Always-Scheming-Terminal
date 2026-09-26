import sys

with open('src/app/api-explorer/page.tsx', 'r') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'text-[9px]' in line:
        # Replace this line and next two lines
        new_lines = [
            '                <span className={`text-[9px] px-1 py-0.5 rounded ${endpoint.requiresKey ? "bg-ast-gold/10 text-ast-gold border border-ast-gold/20" : "bg-ast-mint/10 text-ast-mint border border-ast-mint/20"}`}>\n',
            '                  {endpoint.requiresKey ? "API key" : "public"}\n',
            '                </span>\n'
        ]
        # Ensure we have three lines
        lines[i:i+3] = new_lines
        print(f"Fixed badge at line {i+1}")
        break

with open('src/app/api-explorer/page.tsx', 'w') as f:
    f.writelines(lines)

print("Badge fixed")
