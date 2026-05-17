import { describe, it, expect } from 'vitest';

describe('basic tests', () => {
	it('should pass', () => {
		expect(true).toBe(true);
	});

	it('should handle array operations', () => {
		const arr = [1, 2, 3];
		expect(arr.map((x) => x * 2)).toEqual([2, 4, 6]);
	});
});
