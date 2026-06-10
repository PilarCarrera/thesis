import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np

# Per-participant NASA-TLX data
mental_A =      [7, 3, 4, 5, 5, 6, 3, 5, 7, 3, 6, 2, 6]
mental_B =      [4, 4, 5, 4, 3, 5, 4, 3, 5, 5, 4, 5, 3]
success_A =     [2, 6, 1, 6, 3, 7, 7, 6, 6, 4, 5, 6, 3]
success_B =     [5, 3, 3, 6, 4, 6, 7, 7, 6, 4, 5, 6, 6]
frustration_A = [6, 2, 3, 6, 4, 4, 4, 6, 2, 4, 5, 4, 6]
frustration_B = [2, 3, 5, 5, 3, 4, 4, 3, 1, 5, 5, 4, 2]
physical_A =    [1, 1, 5, 4, 1, 1, 1, 3, 3, 2, 2, 1, 4]
physical_B =    [1, 1, 4, 3, 1, 3, 1, 2, 5, 2, 2, 1, 1]
time_A =        [4, 1, 3, 5, 1, 2, 2, 6, 3, 2, 2, 7, 1]
time_B =        [3, 1, 5, 4, 1, 3, 2, 3, 7, 2, 2, 5, 2]

participants = [f"P{str(i).zfill(2)}" for i in range(1, 14)]
dims = ["Mental\nDemand", "Perceived\nSuccess", "Frustration", "Physical\nDemand", "Time\nPressure"]

# Stack per participant: shape (13, 5)
data_A = list(zip(mental_A, success_A, frustration_A, physical_A, time_A))
data_B = list(zip(mental_B, success_B, frustration_B, physical_B, time_B))

# ── Radar chart: MEANS per condition ──────────────────────────────────────────
mean_A = [np.mean(mental_A), np.mean(success_A), np.mean(frustration_A),
          np.mean(physical_A), np.mean(time_A)]
mean_B = [np.mean(mental_B), np.mean(success_B), np.mean(frustration_B),
          np.mean(physical_B), np.mean(time_B)]

N = len(dims)
angles = np.linspace(0, 2 * np.pi, N, endpoint=False).tolist()
angles += angles[:1]  # close the polygon

vals_A = mean_A + mean_A[:1]
vals_B = mean_B + mean_B[:1]

fig_r, ax_r = plt.subplots(figsize=(6, 6), subplot_kw=dict(polar=True))

ax_r.plot(angles, vals_A, color="#5B9BD5", linewidth=2, label="Condition A")
ax_r.fill(angles, vals_A, color="#5B9BD5", alpha=0.20)
ax_r.plot(angles, vals_B, color="#ED7D31", linewidth=2, label="Condition B")
ax_r.fill(angles, vals_B, color="#ED7D31", alpha=0.20)

ax_r.set_thetagrids(np.degrees(angles[:-1]), dims, fontsize=10)
ax_r.set_ylim(0, 7)
ax_r.set_yticks([1, 2, 3, 4, 5, 6, 7])
ax_r.set_yticklabels(["1", "2", "3", "4", "5", "6", "7"], fontsize=7, color="grey")
ax_r.legend(loc="upper right", bbox_to_anchor=(1.3, 1.1), fontsize=9)
ax_r.set_title("Mean NASA-TLX per Condition", pad=18, fontsize=11)

fig_r.tight_layout()
fig_r.savefig("/home/claude/plots/nasa_tlx_radar.png", dpi=150, bbox_inches="tight")
print("Saved nasa_tlx_radar.png")

# ── Per-participant heatmap ───────────────────────────────────────────────────
# Show difference B - A for each participant x dimension
diff = np.array(data_B, dtype=float) - np.array(data_A, dtype=float)

fig_h, ax_h = plt.subplots(figsize=(9, 6))

im = ax_h.imshow(diff, cmap="RdYlGn", vmin=-4, vmax=4, aspect="auto")

ax_h.set_xticks(range(5))
ax_h.set_xticklabels(["Mental\nDemand", "Perceived\nSuccess", "Frustration",
                       "Physical\nDemand", "Time\nPressure"], fontsize=9)
ax_h.set_yticks(range(13))
ax_h.set_yticklabels(participants, fontsize=9)

# Annotate each cell with the numeric difference
for i in range(13):
    for j in range(5):
        val = diff[i, j]
        ax_h.text(j, i, f"{val:+.0f}", ha="center", va="center",
                  fontsize=9, color="black")

cbar = fig_h.colorbar(im, ax=ax_h, pad=0.02)
cbar.set_label("B − A (positive = higher in B)", fontsize=9)

# For Success: positive is BETTER in B; for all others: negative is BETTER in B
ax_h.set_title(
    "NASA-TLX Difference per Participant (Condition B − Condition A)\n"
    "Success: green = improvement.  All other dimensions: red = improvement.",
    fontsize=10, pad=10
)

fig_h.tight_layout()
fig_h.savefig("/home/claude/plots/nasa_tlx_heatmap.png", dpi=150, bbox_inches="tight")
print("Saved nasa_tlx_heatmap.png")