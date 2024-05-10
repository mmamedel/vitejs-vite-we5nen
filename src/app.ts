export function downloadBlob(blob: Blob, name: string) {
  let url = window.URL.createObjectURL(blob);
  let a = document.createElement("a");
  a.style.display = "none";
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
}

export function findClosestNumber<T extends number>(
  num: number,
  list: readonly T[]
) {
  const diffs = list.map((listNum) => ({
    listNum,
    diff: Math.abs(listNum - num),
  }));
  const orderedDiffs = diffs.sort((a, b) => a.diff - b.diff);
  return orderedDiffs[0].listNum;
}
