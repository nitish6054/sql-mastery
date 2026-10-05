// Compact problem builder. Q(id,title,dataset,topics,difficulty,skills,prompt,output,orderMatters,solution,[testName,why,patch,category?],hints,explain,trap,extra)
export const Q = (id, title, dataset, topics, difficulty, skills, prompt, output, orderMatters, solution, t, hints, explain, trap, extra = {}) => ({
  v: 1, id, title, dataset, topics, difficulty, skills, domain: extra.domain || dataset, timeTarget: { Easy: 7, Medium: 10, Hard: 14, 'Very Hard': 18 }[difficulty],
  prompt, output, orderMatters, solution, tests: [{ name: t[0], category: t[3] || 'Edge cases', why: t[1], patch: t[2] }], hints, explain, trap, patterns: [], ...extra,
});
