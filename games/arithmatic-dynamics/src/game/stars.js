// Star-goal evaluation. Pure: given a session (post-play) and a level,
// return which star ids were earned.
//
// Each level star has an `id` and a `test(session) -> boolean`. This
// module simply runs the tests defensively.

export function evaluateStars(session, level) {
    const stars = (level && level.stars) || [];
    const earned = [];
    for (const star of stars) {
        try {
            if (star.test(session)) earned.push(star.id);
        } catch {
            // A misbehaving test never crashes evaluation.
        }
    }
    return {earned};
}

// Helper used by level authors: is the set of verbs used a subset of
// the allowed list?
export function verbsSubsetOf(session, allowed) {
    for (const v of session.verbsUsed) {
        if (!allowed.includes(v)) return false;
    }
    return true;
}