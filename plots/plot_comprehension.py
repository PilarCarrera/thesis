import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np

# Data — Score (A) and Score (B) per participant, in order P01–P13
participants = [f"P{str(i).zfill(2)}" for i in range(1, 14)]
score_A = [1, 2, 0, 3, 2, 4, 3, 3, 3, 1, 2, 1, 2]
score_B = [1, 3, 2, 2, 2, 3, 2, 3, 3, 2, 3, 3, 1]

x = np.arange(len(participants))

fig, ax = plt.subplots(figsize=(12, 5))

# Draw connecting lines first (behind dots)
for i in range(len(participants)):
    color = "#cccccc"
    ax.plot([x[i], x[i]], [score_A[i], score_B[i]], color=color, linewidth=1.2, zorder=1)

# Dots
ax.scatter(x, score_A, color="#5B9BD5", s=90, zorder=3, label="Condition A (no visual emphasis)")
ax.scatter(x, score_B, color="#ED7D31", s=90, zorder=3, label="Condition B (with visual emphasis)")

# Annotate participants who scored HIGHER in A (P04, P06, P07) — note the disconnect
disconnect_idx = [3, 5, 6]  # P04, P06, P07 (0-indexed)
for i in disconnect_idx:
    ax.annotate("", xy=(x[i], score_A[i] + 0.08), xytext=(x[i], score_A[i]),
                arrowprops=dict(arrowstyle="-", color="#5B9BD5", lw=0))

# Mean lines
mean_A = np.mean(score_A)
mean_B = np.mean(score_B)
ax.axhline(mean_A, color="#5B9BD5", linewidth=1.2, linestyle="--", alpha=0.6)
ax.axhline(mean_B, color="#ED7D31", linewidth=1.2, linestyle="--", alpha=0.6)
ax.text(12.6, mean_A + 0.07, f"M={mean_A:.2f}", color="#5B9BD5", fontsize=8, va="bottom")
ax.text(12.6, mean_B + 0.07, f"M={mean_B:.2f}", color="#ED7D31", fontsize=8, va="bottom")

ax.set_xticks(x)
ax.set_xticklabels(participants)
ax.set_yticks([0, 1, 2, 3, 4])
ax.set_yticklabels(["0", "1", "2", "3", "4 (max)"])
ax.set_ylabel("Comprehension Score (out of 4)")
ax.set_xlabel("Participant")
ax.set_ylim(-0.3, 4.5)
ax.legend(loc="upper left", fontsize=9)
ax.spines["top"].set_visible(False)
ax.spines["right"].set_visible(False)

# Shade participants who scored higher in A (preference-performance disconnect)
for i in disconnect_idx:
    ax.axvspan(x[i] - 0.4, x[i] + 0.4, color="#FFE0E0", alpha=0.5, zorder=0)

# Add a note
fig.text(0.13, 0.01,
         "Pink shading = participants who scored higher in Condition A (no visual emphasis) despite many preferring it subjectively.",
         fontsize=7.5, color="#888888")

plt.tight_layout(rect=[0, 0.04, 1, 1])
plt.savefig("/home/claude/plots/comprehension_scores.png", dpi=150, bbox_inches="tight")
print("Saved comprehension_scores.png")