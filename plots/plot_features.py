import matplotlib.pyplot as plt
import numpy as np

# Data from Table 7.5 — counts out of 13
features = [
    "Added own\nhighlights",
    "Used contextual\nsummary",
    "Used conversational\nassistant",
    "Used personalization\nsettings",
    "Modified AI\nvisual emphasis",
    "Deleted all AI\nvisual emphasis",
    "Asked exam\nquestions directly",
]

count_A = [9, 13, 10, 5, 0, 0, 2]
count_B = [6, 13, 11, 6, 6, 2, 2]

x = np.arange(len(features))
width = 0.35

fig, ax = plt.subplots(figsize=(13, 5.5))

bars_A = ax.bar(x - width/2, count_A, width,
                label="Condition A (no visual emphasis)",
                color="#5B9BD5", alpha=0.85, zorder=2)
bars_B = ax.bar(x + width/2, count_B, width,
                label="Condition B (with visual emphasis)",
                color="#ED7D31", alpha=0.85, zorder=2)

# Value labels on top of each bar
for bar in bars_A:
    h = bar.get_height()
    if h > 0:
        ax.text(bar.get_x() + bar.get_width()/2, h + 0.15,
                f"{int(h)}/13", ha="center", va="bottom", fontsize=8, color="#333333")

for bar in bars_B:
    h = bar.get_height()
    if h > 0:
        ax.text(bar.get_x() + bar.get_width()/2, h + 0.15,
                f"{int(h)}/13", ha="center", va="bottom", fontsize=8, color="#333333")

ax.set_xticks(x)
ax.set_xticklabels(features, fontsize=9)
ax.set_ylabel("Number of Participants (out of 13)")
ax.set_ylim(0, 15.5)
ax.set_yticks(range(0, 14))
ax.legend(fontsize=9)
ax.spines["top"].set_visible(False)
ax.spines["right"].set_visible(False)
ax.yaxis.grid(True, linestyle="--", alpha=0.4, zorder=0)

# Note: Condition A has no AI visual emphasis to modify/delete — mark N/A
for i in [4, 5]:
    ax.text(x[i] - width/2, 0.3, "N/A", ha="center", va="bottom",
            fontsize=7.5, color="#aaaaaa", style="italic")

plt.tight_layout()
plt.savefig("/home/claude/plots/feature_usage.png", dpi=150, bbox_inches="tight")
print("Saved feature_usage.png")