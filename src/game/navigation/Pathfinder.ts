import type { Point } from '../movement/MovementController';
import { NavigationGrid, type Cell } from './Grid';
const STEPS = [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1},{x:1,y:1},{x:1,y:-1},{x:-1,y:1},{x:-1,y:-1}];
const heuristic = (a: Cell, b: Cell): number => {
  const dx = Math.abs(a.x-b.x), dy = Math.abs(a.y-b.y);
  return Math.max(dx,dy) + (Math.SQRT2-1)*Math.min(dx,dy);
};
export function findPath(grid: NavigationGrid, origin: Point, destination: Point): Point[] | null {
  const start = grid.cellAt(origin);
  if (!grid.isWalkable(start)) return null;
  const target = grid.nearestWalkable(grid.cellAt(destination));
  if (!target) return null;
  const targetPoint = grid.isWalkable(grid.cellAt(destination)) ? destination : grid.center(target);
  if (grid.isSegmentWalkable(origin, targetPoint)) return [targetPoint];
  const startKey = grid.key(start), targetKey = grid.key(target);
  const open: Cell[] = [start], openKeys = new Set([startKey]);
  const cameFrom = new Map<string,string>();
  const scores = new Map<string,number>([[startKey,0]]);
  const cells = new Map<string,Cell>([[startKey,start]]);
  while (open.length) {
    let best = 0;
    for (let i=1;i<open.length;i++) {
      const a=open[i], b=open[best];
      if ((scores.get(grid.key(a))??Infinity)+heuristic(a,target) < (scores.get(grid.key(b))??Infinity)+heuristic(b,target)) best=i;
    }
    const current = open.splice(best,1)[0], key=grid.key(current);
    openKeys.delete(key);
    if (key===targetKey) {
      const path: Point[] = [targetPoint];
      let cursor=key;
      while (cursor!==startKey) {
        const previous=cameFrom.get(cursor);
        if (!previous) return null;
        if (cursor!==targetKey) path.unshift(grid.center(cells.get(cursor)!));
        cursor=previous;
      }
      const smooth: Point[]=[];
      let anchor=origin;
      for (let i=0;i<path.length;) {
        let far=i;
        for (let j=i+1;j<path.length;j++) {
          if (!grid.isSegmentWalkable(anchor,path[j])) break;
          far=j;
        }
        smooth.push(path[far]); anchor=path[far]; i=far+1;
      }
      return smooth;
    }
    for (const step of STEPS) {
      const next={x:current.x+step.x,y:current.y+step.y};
      if (!grid.isWalkable(next)) continue;
      if (step.x && step.y && (!grid.isWalkable({x:current.x+step.x,y:current.y}) || !grid.isWalkable({x:current.x,y:current.y+step.y}))) continue;
      const nextKey=grid.key(next), score=(scores.get(key)??Infinity)+(step.x&&step.y?Math.SQRT2:1);
      if (score >= (scores.get(nextKey)??Infinity)) continue;
      cameFrom.set(nextKey,key); scores.set(nextKey,score); cells.set(nextKey,next);
      if (!openKeys.has(nextKey)) {open.push(next);openKeys.add(nextKey);}
    }
  }
  return null;
}
