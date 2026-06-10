import matplotlib.pyplot as plt
import numpy as np

participants = [f"P{str(i).zfill(2)}" for i in range(1, 14)]
time_A = [24, 14.75, 21.35, 23, 25, 17.28, 15, 28, 30, 25, 18, 10, 40]
time_B = [21, 16, 26.67, 15.23, 17, 16.88, 16, 15, 17, 25, 14, 15, 20]

x = np.arange(len(participants))
width = 0.35

fig, ax = plt.subplots(figsize=(13, 5))

bars_A = ax.bar(x - width/2, time_A, width, label="Condition A (no visual emphasis)",
                color="#5B9BD5", alpha=0.85, zorder=2)
bars_B = ax.bar(x + width/2, time_B, width, label="Condition B (with visual emphasis)",
                color="#ED7D31", alpha=0.85, zorder=2)

# Mean lines
mean_A = np.mean(time_A)
mean_B = np.mean(time_B)
ax.axhline(mean_A, color="#5B9BD5", linewidth=1.3, linestyle="--", alpha=0.7)
ax.axhline(mean_B, color="#ED7D31", linewidth=1.3, linestyle="--", alpha=0.7)
ax.text(12.7, mean_A + 0.4, f"M={mean_A:.1f}", color="#5B9BD5", fontsize=8)
ax.text(12.7, mean_B + 0.4, f"M={mean_B:.1f}", color="#ED7D31", fontsize=8)

# Highlight P13 — the most dramatic difference (40→20 min)
ax.annotate("P13:\n40→20 min", xy=(12 + width/2, 20), xytext=(10.8, 34),
            arrowprops=dict(arrowstyle="->", color="#333333", lw=1),
            fontsize=8, color="#333333")

ax.set_xticks(x)
ax.set_xticklabels(participants)
ax.set_ylabel("Task Completion Time (minutes)")
ax.set_xlabel("Participant")
ax.set_ylim(0, 46)
ax.legend(loc="upper left", fontsize=9)
ax.spines["top"].set_visible(False)
ax.spines["right"].set_visible(False)
ax.yaxis.grid(True, linestyle="--", alpha=0.4, zorder=0)

plt.tight_layout()
plt.savefig("/home/claude/plots/completion_times.png", dpi=150, bbox_inches="tight")
print("Saved completion_times.png")