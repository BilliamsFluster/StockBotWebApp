import { render, screen } from '@testing-library/react';
import { Badge } from '../badge';

test('renders provided text', () => {
  render(<Badge>Test Badge</Badge>);
  expect(screen.getByText('Test Badge')).toBeInTheDocument();
});
