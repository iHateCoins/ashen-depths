import { describe, expect, it } from 'vitest';
import { NavigationGrid } from '../src/game/navigation/Grid';
import { findPath } from '../src/game/navigation/Pathfinder';
describe('grid pathfinding', () => {
  it('finds a direct route in an open room', () => {
    const grid=new NavigationGrid(320,320,32);
    expect(findPath(grid,{x:48,y:48},{x:270,y:270})).toEqual([{x:270,y:270}]);
  });
  it('routes around a wall through an opening', () => {
    const grid=new NavigationGrid(320,320,32);
    for(let y=0;y<9;y++) if(y!==7) grid.setBlocked({x:4,y});
    const path=findPath(grid,{x:48,y:48},{x:240,y:48});
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(1);
    let p={x:48,y:48};
    for(const next of path!) {expect(grid.isSegmentWalkable(p,next)).toBe(true);p=next;}
  });
  it('rejects a completely isolated target', () => {
    const grid=new NavigationGrid(160,160,32);
    for(let y=0;y<5;y++)grid.setBlocked({x:2,y});
    expect(findPath(grid,{x:48,y:48},{x:112,y:48})).toBeNull();
  });
  it('snaps blocked destinations to walkable cells', () => {
    const grid=new NavigationGrid(160,160,32);
    grid.setBlocked({x:3,y:3});
    const path=findPath(grid,{x:48,y:48},{x:112,y:112});
    expect(path).not.toBeNull();
    expect(grid.isWalkable(grid.cellAt(path!.at(-1)!))).toBe(true);
  });
  it('does not cut diagonally through blocked corners', () => {
    const grid=new NavigationGrid(96,96,32);
    grid.setBlocked({x:1,y:0});grid.setBlocked({x:0,y:1});
    expect(findPath(grid,{x:16,y:16},{x:80,y:80})).toBeNull();
  });
});
