import { expect } from 'chai'
import { createStore } from 'redux'
import undoable, { ActionCreators, excludeAction, includeAction, isHistory } from '../src/index'

const decrementActions = ['DECREMENT']

const testConfigZero = {
  FOR_TEST_ONLY_includeActions: decrementActions,
  filter: includeAction(decrementActions)
}

const testConfigOne = {
  limit: 100,
  initTypes: 'RE-INITIALIZE',
  FOR_TEST_ONLY_excludedActions: decrementActions,
  filter: excludeAction(decrementActions)
}
const initialStateOne = {
  past: [0, 1, 2, 3],
  present: 4,
  future: [5, 6, 7]
}

const testConfigTwo = {
  limit: 1024,
  initTypes: 'RE-INITIALIZE'
}
const initialStateTwo = {
  past: [123],
  present: 5,
  future: [-1, -2, -3]
}

const testConfigThree = {
  limit: -1,
  initTypes: []
}
const initialStateThree = {
  past: [5, {}, 3, null, 1],
  present: Math.pow(2, 32),
  future: []
}

runTestWithConfig({}, undefined, 'Default config')
runTestWithConfig({ initTypes: [] }, undefined, 'No Init types')
runTestWithConfig({ limit: 200 }, 100, 'Initial State equals 100')
runTestWithConfig({}, {'present': 0}, 'Initial State that looks like a history')
runTestWithConfig(testConfigZero, undefined, 'Filter (Include Actions)')
runTestWithConfig(testConfigOne, initialStateOne, 'Initial History and Filter (Exclude Actions)')
runTestWithConfig(testConfigTwo, initialStateTwo, 'Initial State and Init types')
runTestWithConfig(testConfigThree, initialStateThree, 'Erroneous configuration')

// Test undoable reducers as a function of a configuration object
// `label` describes the nature of the configuration object used to run a test
function runTestWithConfig (testConfig, initialStoreState, label) {
  describe('Undoable: ' + label, () => {
    const countReducer = (state = 0, action = {}) => {
      switch (action.type) {
        case 'INCREMENT':
          return state + 1
        case 'DECREMENT':
          return state - 1
        default:
          return state
      }
    }

    const tenfoldReducer = (state = 10, action = {}) => {
      switch (action.type) {
        case 'INCREMENT':
          return state + 10
        case 'DECREMENT':
          return state - 10
        default:
          return state
      }
    }

    let mockUndoableReducer
    let mockInitialState
    let incrementedState
    let store

    before('setup mock reducers and states', () => {
      // testConfig.debug = true
      mockUndoableReducer = undoable(countReducer, testConfig)
      store = createStore(mockUndoableReducer, initialStoreState)

      mockInitialState = mockUndoableReducer(undefined, {})
      incrementedState = mockUndoableReducer(mockInitialState, { type: 'INCREMENT' })
      console.info('  Beginning Test! Good luck!')
      console.info('    initialStoreState:     ', initialStoreState)
      console.info('    store.getState():      ', store.getState())
      console.info('    mockInitialState:      ', mockInitialState)
      console.info('    incrementedState:      ', incrementedState)
      console.info('')

      expect(store.getState()).to.deep.equal(mockInitialState, 'mockInitialState should be the same as our store\'s state')
    })

    describe('Initial state', () => {
      it('should be initialized with the value of the default `initialState` of the reducer if there is no `initialState` set on the store', () => {
        if (initialStoreState === undefined) {
          expect(mockInitialState.present).to.equal(countReducer())
        }
      })

      it('should be initialized with the the store\'s initial `history` if provided', () => {
        if (initialStoreState !== undefined && isHistory(initialStoreState)) {
          expect(mockInitialState).to.deep.equal(initialStoreState)
        }
      })

      it('should be initialized with the the store\'s initial `state` if provided', () => {
        if (initialStoreState !== undefined && !isHistory(initialStoreState)) {
          expect(mockInitialState).to.deep.equal({
            past: [],
            present: initialStoreState,
            future: []
          })
        }
      })
    })

    describe('Replace reducers on the fly', () => {
      it('should preserve state when reducers are replaced', () => {
        store.replaceReducer(undoable(tenfoldReducer, testConfig))
        expect(store.getState()).to.deep.equal(mockInitialState)

        // swap back for other tests
        store.replaceReducer(mockUndoableReducer)
        expect(store.getState()).to.deep.equal(mockInitialState)
      })

      it('should use replaced reducer for new actions', () => {
        store.replaceReducer(undoable(tenfoldReducer, testConfig))

        // Increment and check result
        let expectedResult = tenfoldReducer(store.getState().present, {type: 'INCREMENT'})
        store.dispatch({type: 'INCREMENT'})
        expect(store.getState().present).to.equal(expectedResult)

        // swap back for other tests
        store.replaceReducer(mockUndoableReducer)

        // Increment and check result again
        expectedResult = countReducer(store.getState().present, {type: 'INCREMENT'})
        store.dispatch({type: 'INCREMENT'})
        expect(store.getState().present).to.equal(expectedResult)
      })
    })

    describe('Actions', () => {
      it('should not record unwanted actions', () => {
        if (testConfig.FOR_TEST_ONLY_excludedActions) {
          // don't record this action in history
          let decrementedState = mockUndoableReducer(mockInitialState, { type: testConfig.FOR_TEST_ONLY_excludedActions[0] })
          expect(decrementedState.past).to.deep.equal(mockInitialState.past)
          expect(decrementedState.future).to.deep.equal(mockInitialState.future)
        }

        if (testConfig.FOR_TEST_ONLY_includeActions) {
          // only record this action in history
          let tmpState = mockUndoableReducer(mockInitialState, { type: testConfig.FOR_TEST_ONLY_includeActions[0] })
          let expected = { ...tmpState, present: tmpState.present + 1 }
          // and not this one...
          tmpState = mockUndoableReducer(tmpState, { type: 'INCREMENT' })
          expect(tmpState).to.deep.equal(expected)
        }
      })

      it('should not record non state changing actions', () => {
        let dummyState = mockUndoableReducer(incrementedState, { type: 'DUMMY' })
        expect(dummyState).to.deep.equal(incrementedState)
      })

      it('should reset upon init actions', () => {
        let reInitializedState
        if (testConfig.initTypes) {
          if (testConfig.initTypes.length) {
            let initType = Array.isArray(testConfig.initTypes) ? testConfig.initTypes[0] : testConfig.initTypes
            reInitializedState = mockUndoableReducer(incrementedState, { type: initType })
            expect(reInitializedState).to.deep.equal(mockInitialState)
          } else {
            // No init actions exist, init should have no effect
            reInitializedState = mockUndoableReducer(incrementedState, { type: '@@redux-undo/INIT' })
            expect(reInitializedState).to.deep.equal(incrementedState)
          }
        } else {
          reInitializedState = mockUndoableReducer(incrementedState, { type: '@@redux-undo/INIT' })
          expect(reInitializedState).to.deep.equal(mockInitialState)
        }
      })

      it('should increment when action is dispatched to store', () => {
        let expectedResult = store.getState().present + 1
        store.dispatch({type: 'INCREMENT'})
        expect(store.getState().present).to.equal(expectedResult)
      })
    })

    describe('Undo', () => {
      let undoState
      before('perform an undo action', () => {
        undoState = mockUndoableReducer(incrementedState, ActionCreators.undo())
      })

      it('should change present state back by one action', () => {
        if (testConfig.limit >= 0) {
          expect(undoState.present).to.equal(mockInitialState.present)
        }
      })

      it('should change present state to last element of \'past\'', () => {
        if (testConfig.limit >= 0) {
          expect(undoState.present).to.equal(incrementedState.past[incrementedState.past.length - 1])
        }
      })

      it('should add a new element to \'future\' from last state', () => {
        if (testConfig.limit >= 0) {
          expect(undoState.future[0]).to.equal(incrementedState.present)
        }
      })

      it('should decrease length of \'past\' by one', () => {
        if (testConfig.limit >= 0) {
          expect(undoState.past.length).to.equal(incrementedState.past.length - 1)
        }
      })

      it('should increase length of \'future\' by one', () => {
        if (testConfig.limit >= 0) {
          expect(undoState.future.length).to.equal(incrementedState.future.length + 1)
        }
      })

      it('should do nothing if \'past\' is empty', () => {
        let undoInitialState = mockUndoableReducer(mockInitialState, ActionCreators.undo())
        if (!mockInitialState.past.length) {
          expect(undoInitialState.present).to.deep.equal(mockInitialState.present)
        }
      })
    })

    describe('Redo', () => {
      let undoState
      let redoState
      before('perform an undo action then a redo action', () => {
        undoState = mockUndoableReducer(incrementedState, ActionCreators.undo())
        redoState = mockUndoableReducer(undoState, ActionCreators.redo())
      })

      it('should change present state to equal state before undo', () => {
        expect(redoState.present).to.equal(incrementedState.present)
      })

      it('should change present state to first element of \'future\'', () => {
        if (testConfig.limit >= 0) {
          expect(redoState.present).to.equal(undoState.future[0])
        }
      })

      it('should add a new element to \'past\' from last state', () => {
        if (testConfig.limit >= 0) {
          expect(redoState.past[redoState.past.length - 1]).to.equal(undoState.present)
        }
      })

      it('should decrease length of \'future\' by one', () => {
        if (testConfig.limit >= 0) {
          expect(redoState.future.length).to.equal(undoState.future.length - 1)
        }
      })

      it('should increase length of \'past\' by one', () => {
        if (testConfig.limit >= 0) {
          expect(redoState.past.length).to.equal(undoState.past.length + 1)
        }
      })

      it('should do nothing if \'future\' is empty', () => {
        let secondRedoState = mockUndoableReducer(redoState, ActionCreators.redo())
        if (!redoState.future.length) {
          expect(secondRedoState.present).to.deep.equal(redoState.present)
        }
      })
    })

    describe('JumpToPast', () => {
      const jumpToPastIndex = 0
      let jumpToPastState
      before('perform a jumpToPast action', () => {
        jumpToPastState = mockUndoableReducer(incrementedState, ActionCreators.jumpToPast(jumpToPastIndex))
      })

      it('should change present to a given value from past', () => {
        const pastState = incrementedState.past[jumpToPastIndex]
        if (pastState !== undefined) {
          expect(jumpToPastState.present).to.equal(pastState)
        }
      })

      it('should do nothing if past index is out of bounds', () => {
        let jumpToOutOfBounds = mockUndoableReducer(incrementedState, ActionCreators.jumpToPast(-1))
        expect(jumpToOutOfBounds).to.deep.equal(incrementedState)
      })

      it('should increase the length of future if successful', () => {
        if (incrementedState.past.length > jumpToPastIndex) {
          expect(jumpToPastState.future.length).to.be.above(incrementedState.future.length)
        }
      })

      it('should decrease the length of past if successful', () => {
        if (incrementedState.past.length > jumpToPastIndex) {
          expect(jumpToPastState.past.length).to.be.below(incrementedState.past.length)
        }
      })
    })

    describe('JumpToFuture', () => {
      const jumpToFutureIndex = 2
      let jumpToFutureState
      before('perform a jumpToFuture action', () => {
        jumpToFutureState = mockUndoableReducer(mockInitialState, ActionCreators.jumpToFuture(jumpToFutureIndex))
      })

      it('should change present to a given value from future', () => {
        const futureState = mockInitialState.future[jumpToFutureIndex]
        if (futureState !== undefined) {
          expect(jumpToFutureState.present).to.equal(futureState)
        }
      })

      it('should do nothing if future index is out of bounds', () => {
        let jumpToOutOfBounds = mockUndoableReducer(mockInitialState, ActionCreators.jumpToFuture(-1))
        expect(jumpToOutOfBounds).to.deep.equal(mockInitialState)
      })

      it('should increase the length of past if successful', () => {
        if (mockInitialState.future.length > jumpToFutureIndex) {
          expect(jumpToFutureState.past.length).to.be.above(mockInitialState.past.length)
        }
      })

      it('should decrease the length of future if successful', () => {
        if (mockInitialState.future.length > jumpToFutureIndex) {
          expect(jumpToFutureState.future.length).to.be.below(mockInitialState.future.length)
        }
      })

      it('should do a redo if index = 0', () => {
        if (mockInitialState.future.length > 0) {
          jumpToFutureState = mockUndoableReducer(mockInitialState, ActionCreators.jumpToFuture(0))
          const redoState = mockUndoableReducer(mockInitialState, ActionCreators.redo())
          expect(redoState).to.deep.equal(jumpToFutureState)
        }
      })
    })

    describe('Jump', () => {
      const jumpStepsToPast = -2
      const jumpStepsToFuture = 2
      let jumpToPastState
      let jumpToFutureState
      let doubleUndoState
      let doubleRedoState
      before('perform a jump action', () => {
        let doubleIncrementedState = mockUndoableReducer(incrementedState, { type: 'INCREMENT' })
        jumpToPastState = mockUndoableReducer(doubleIncrementedState, ActionCreators.jump(jumpStepsToPast))
        jumpToFutureState = mockUndoableReducer(mockInitialState, ActionCreators.jump(jumpStepsToFuture))
        doubleUndoState = mockUndoableReducer(doubleIncrementedState, ActionCreators.undo())
        doubleUndoState = mockUndoableReducer(doubleUndoState, ActionCreators.undo())
        doubleRedoState = mockUndoableReducer(mockInitialState, ActionCreators.redo())
        doubleRedoState = mockUndoableReducer(doubleRedoState, ActionCreators.redo())
      })

      it('-2 steps should result in same state as two times undo', () => {
        expect(doubleUndoState).to.deep.equal(jumpToPastState)
      })

      it('+2 steps should result in same state as two times redo', () => {
        expect(doubleRedoState).to.deep.equal(jumpToFutureState)
      })

      it('should do nothing if steps is 0', () => {
        let jumpToCurrentState = mockUndoableReducer(mockInitialState, ActionCreators.jump(0))
        expect(jumpToCurrentState).to.deep.equal(mockInitialState)
      })

      it('should do nothing if steps is out of bounds', () => {
        let jumpToOutOfBounds = mockUndoableReducer(mockInitialState, ActionCreators.jump(10))
        expect(jumpToOutOfBounds).to.deep.equal(mockInitialState)
        jumpToOutOfBounds = mockUndoableReducer(mockInitialState, ActionCreators.jump(-10))
        expect(jumpToOutOfBounds).to.deep.equal(mockInitialState)
      })
    })

    describe('Clear History', () => {
      let clearedState

      before('perform a clearHistory action', () => {
        clearedState = mockUndoableReducer(incrementedState, ActionCreators.clearHistory())
      })

      it('should clear future and past', () => {
        expect(clearedState.past.length).to.equal(0)
        expect(clearedState.future.length).to.equal(0)
      })

      it('should preserve the present value', () => {
        expect(clearedState.present).to.equal(incrementedState.present)
      })
    })
  })
}
