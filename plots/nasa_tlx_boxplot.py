import matplotlib.pyplot as plt

# Data
mental_A = [7,3,4,5,5,6,3,5,7,3,6,2,6]
mental_B = [4,4,5,4,3,5,4,3,5,5,4,5,3]

success_A = [2,6,1,6,3,7,7,6,6,4,5,6,3]
success_B = [5,3,3,6,4,6,7,7,6,4,5,6,6]

frustration_A = [6,2,3,6,4,4,4,6,2,4,5,4,6]
frustration_B = [2,3,5,5,3,4,4,3,1,5,5,4,2]

physical_A = [1,1,5,4,1,1,1,3,3,2,2,1,4]
physical_B = [1,1,4,3,1,3,1,2,5,2,2,1,1]

time_A = [4,1,3,5,1,2,2,6,3,2,2,7,1]
time_B = [3,1,5,4,1,3,2,3,7,2,2,5,2]

data_A = [mental_A, success_A, frustration_A, physical_A, time_A]
data_B = [mental_B, success_B, frustration_B, physical_B, time_B]

labels = [
    "Mental\nDemand",
    "Success",
    "Frustration",
    "Physical\nDemand",
    "Time\nPressure"
]

positions_A = [1,4,7,10,13]
positions_B = [2,5,8,11,14]

fig, ax = plt.subplots(figsize=(12,6))

bpA = ax.boxplot(
    data_A,
    positions=positions_A,
    widths=0.6,
    patch_artist=True
)

bpB = ax.boxplot(
    data_B,
    positions=positions_B,
    widths=0.6,
    patch_artist=True
)

for patch in bpB["boxes"]:
    patch.set_facecolor("orange")

ax.set_xticks([1.5,4.5,7.5,10.5,13.5])
ax.set_xticklabels(labels)

ax.set_ylabel("NASA-TLX Rating")
ax.set_ylim(0,7)

ax.legend(
    [bpA["boxes"][0], bpB["boxes"][0]],
    ["Condition A", "Condition B"]
)

plt.tight_layout()
plt.savefig("plots/nasa_tlx_boxplot.png", dpi=150, bbox_inches="tight")
