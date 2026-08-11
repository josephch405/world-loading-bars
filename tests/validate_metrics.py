import os
import re
import sys
import glob

workspace_dir = "/Users/jochuang/projects/world-loading-bars"
index_path = os.path.join(workspace_dir, "index.html")

def validate():
    errors = []
    warnings = []

    if not os.path.exists(index_path):
        print(f"Error: index.html not found at {index_path}")
        sys.exit(1)

    with open(index_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Regex to find all stat cards
    card_pattern = re.compile(r'<a\s+href="(details/[^"]+)"\s+class="stat-card"[^>]*data-percent="([^"]+)"[^>]*>', re.MULTILINE)
    matches = card_pattern.findall(content)

    print(f"Found {len(matches)} stat cards in index.html.")

    for href, percent_str in matches:
        try:
            percent_val = float(percent_str)
        except ValueError:
            errors.append(f"Card {href}: data-percent '{percent_str}' is not a valid float.")
            continue

        # Check bounds
        if percent_val <= 0 or percent_val > 100:
            errors.append(f"Card {href}: data-percent {percent_val} is out of bounds (must be 0 < val <= 100).")

        # Check for fractional ratings without decoupled display value
        if percent_val < 1.0:
            warnings.append(f"Card {href}: data-percent is {percent_val}% (< 1%). Verify if this is an absolute percentage or if data-display should be used.")

        # Check if detail page exists
        detail_full_path = os.path.join(workspace_dir, href)
        if not os.path.exists(detail_full_path):
            errors.append(f"Card {href}: Target detail page {href} does not exist on disk!")

    print("\n--- Validation Results ---")
    if warnings:
        print(f"⚠️  {len(warnings)} Warning(s):")
        for w in warnings:
            print("  " + w)

    if errors:
        print(f"❌ {len(errors)} Error(s) found:")
        for e in errors:
            print("  " + e)
        sys.exit(1)
    else:
        print("✅ All metrics and detail links validated successfully!")

if __name__ == "__main__":
    validate()
