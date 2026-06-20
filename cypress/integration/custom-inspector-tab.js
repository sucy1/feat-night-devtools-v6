import { suite } from '../utils/suite'

suite('custom inspector tab', () => {
  beforeEach(() => cy.reload())

  it('should have custom inspectors registered by addInspector API', () => {
    cy.visit('/#/custom/simple-kv-inspector')
    cy.get('.vue-ui-group.primary').should('be.visible')
  })

  describe('Simple KV inspector', () => {
    beforeEach(() => {
      cy.visit('/#/custom/simple-kv-inspector')
    })

    it('should display the root data node', () => {
      cy.get('.selectable-item').should('contain', 'Data')
    })

    it('should select root node and show key-value state', () => {
      cy.contains('.selectable-item', 'Data').click()
      cy.get('.data-field').should('have.length.at.least', 1)
      cy.get('.right').should('contain', 'appName')
      cy.get('.right').should('contain', 'message')
      cy.get('.right').should('contain', 'version')
    })
  })

  describe('Simple Tree inspector', () => {
    beforeEach(() => {
      cy.visit('/#/custom/simple-tree-inspector')
    })

    it('should display tree root nodes', () => {
      cy.get('.selectable-item').should('have.length.at.least', 2)
      cy.contains('.selectable-item', 'Root Node').should('be.visible')
      cy.contains('.selectable-item', 'Another Root').should('be.visible')
    })

    it('should expand and display children of Root Node', () => {
      cy.contains('.selectable-item', 'Root Node').within(() => {
        cy.get('.arrow').click({ force: true })
      })
      cy.contains('.selectable-item', 'Child A').should('be.visible')
      cy.contains('.selectable-item', 'Child B').should('be.visible')
    })

    it('should show node state when selecting a child with extra fields', () => {
      cy.contains('.selectable-item', 'Root Node').within(() => {
        cy.get('.arrow').click({ force: true })
      })
      cy.contains('.selectable-item', 'Child A').click()
      cy.get('.right').should('contain', 'value')
      cy.get('.right').should('contain', 'active')
    })

    it('should show state for Another Root node', () => {
      cy.contains('.selectable-item', 'Another Root').click()
      cy.get('.right').should('contain', 'type')
      cy.get('.right').should('contain', 'secondary')
    })

    it('should navigate to the tree inspector via header tab', () => {
      cy.visit('/')
      cy.get('.vue-ui-group.primary .vue-ui-group-button').eq(3).click({ force: true })
      cy.url().should('include', '/custom/simple-tree-inspector')
    })
  })

  describe('Single Node inspector', () => {
    beforeEach(() => {
      cy.visit('/#/custom/simple-single-inspector')
    })

    it('should display the single node', () => {
      cy.contains('.selectable-item', 'Single Node Example').should('be.visible')
    })

    it('should show state when selecting the single node', () => {
      cy.contains('.selectable-item', 'Single Node Example').click()
      cy.get('.right').should('contain', 'data1')
      cy.get('.right').should('contain', 'data2')
    })
  })
})
