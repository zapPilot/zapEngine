import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BundlePageClient } from '../../../../src/app/bundle/BundlePageClient';
import { BundlePageEntry } from '../../../../src/app/bundle/BundlePageEntry';
import { render, screen } from '../../../test-utils';

// Vitest hoists vi.mock, so create the mock function with vi.hoisted
const { mockUseSearchParams } = vi.hoisted(() => ({
  mockUseSearchParams: vi.fn(),
}));

// Mock routing adapter
const mockGet = vi.fn();

vi.mock('@/lib/routing', () => ({
  useAppSearchParams: mockUseSearchParams,
  useAppPathname: () => '/bundle',
}));

vi.mock('../../../../src/app/bundle/BundleProviders', () => ({
  BundleProviders: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock BundlePageClient - captures all props for inspection
vi.mock('../../../../src/app/bundle/BundlePageClient', () => ({
  BundlePageClient: vi.fn((props) => (
    <div data-testid="bundle-page-client" data-user-id={props.userId}>
      BundlePageClient with userId: {props.userId}
    </div>
  )),
}));

describe('BundlePageEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock: return a searchParams object with get method
    mockUseSearchParams.mockReturnValue({
      get: mockGet,
    });
  });

  describe('URL Parameter Extraction', () => {
    it('extracts userId from search parameters', () => {
      mockGet.mockReturnValue('test-user-123');

      render(<BundlePageEntry />);

      expect(mockGet).toHaveBeenCalledWith('userId');
      expect(screen.getByTestId('bundle-page-client')).toHaveAttribute(
        'data-user-id',
        'test-user-123',
      );
      expect(
        screen.getByText('BundlePageClient with userId: test-user-123'),
      ).toBeInTheDocument();
    });

    it('handles null userId from search parameters', () => {
      mockGet.mockReturnValue(null);

      render(<BundlePageEntry />);

      expect(mockGet).toHaveBeenCalledWith('userId');
      expect(screen.getByTestId('bundle-page-client')).toHaveAttribute(
        'data-user-id',
        '',
      );
      expect(
        screen.getByText('BundlePageClient with userId:'),
      ).toBeInTheDocument();
    });

    it('handles null searchParams gracefully', () => {
      mockUseSearchParams.mockReturnValue(null);

      render(<BundlePageEntry />);

      expect(screen.getByTestId('bundle-page-client')).toHaveAttribute(
        'data-user-id',
        '',
      );
    });

    it('handles empty string userId', () => {
      mockGet.mockReturnValue('');

      render(<BundlePageEntry />);

      expect(screen.getByTestId('bundle-page-client')).toHaveAttribute(
        'data-user-id',
        '',
      );
      expect(
        screen.getByText('BundlePageClient with userId:'),
      ).toBeInTheDocument();
    });

    it('handles wallet address format userId', () => {
      const walletAddress = '0x1234567890123456789012345678901234567890';
      mockGet.mockReturnValue(walletAddress);

      render(<BundlePageEntry />);

      expect(screen.getByTestId('bundle-page-client')).toHaveAttribute(
        'data-user-id',
        walletAddress,
      );
      expect(
        screen.getByText(`BundlePageClient with userId: ${walletAddress}`),
      ).toBeInTheDocument();
    });
  });

  describe('Component Rendering', () => {
    it('renders BundlePageClient component', () => {
      mockGet.mockReturnValue('test-user');

      render(<BundlePageEntry />);

      expect(screen.getByTestId('bundle-page-client')).toBeInTheDocument();
    });

    it('passes userId prop to BundlePageClient', () => {
      const testUserId = 'bundle-test-user-456';
      mockGet.mockReturnValue(testUserId);

      render(<BundlePageEntry />);

      expect(screen.getByTestId('bundle-page-client')).toHaveAttribute(
        'data-user-id',
        testUserId,
      );
    });
  });

  describe('Edge Cases', () => {
    it('handles numeric userId', () => {
      mockGet.mockReturnValue('12345');

      render(<BundlePageEntry />);

      expect(screen.getByTestId('bundle-page-client')).toHaveAttribute(
        'data-user-id',
        '12345',
      );
      expect(
        screen.getByText('BundlePageClient with userId: 12345'),
      ).toBeInTheDocument();
    });

    it('handles special characters in userId', () => {
      const specialUserId = 'user-123_test@domain.com';
      mockGet.mockReturnValue(specialUserId);

      render(<BundlePageEntry />);

      expect(screen.getByTestId('bundle-page-client')).toHaveAttribute(
        'data-user-id',
        specialUserId,
      );
    });
  });

  describe('Integration with app router', () => {
    it('calls useSearchParams hook', () => {
      mockGet.mockReturnValue('test-user');

      render(<BundlePageEntry />);

      expect(mockUseSearchParams).toHaveBeenCalled();
      expect(mockGet).toHaveBeenCalledWith('userId');
    });

    it('handles route parameter changes', () => {
      mockGet.mockReturnValue('initial-user');

      const { rerender } = render(<BundlePageEntry />);
      expect(screen.getByTestId('bundle-page-client')).toHaveAttribute(
        'data-user-id',
        'initial-user',
      );

      // Simulate route change
      mockGet.mockReturnValue('updated-user');
      rerender(<BundlePageEntry />);
      expect(screen.getByTestId('bundle-page-client')).toHaveAttribute(
        'data-user-id',
        'updated-user',
      );
    });
  });

  describe('Error Handling', () => {
    it('handles search params error gracefully', () => {
      mockGet.mockImplementation(() => {
        throw new Error('Search params error');
      });

      // Should not crash the component
      expect(() => render(<BundlePageEntry />)).not.toThrow();
    });

    it('handles undefined useSearchParams return', () => {
      mockUseSearchParams.mockReturnValue();

      // Should not crash even with undefined search params
      expect(() => render(<BundlePageEntry />)).not.toThrow();
    });
  });

  describe('Optional Parameters', () => {
    beforeEach(() => {
      vi.mocked(BundlePageClient).mockClear();
    });

    it('passes walletId to BundlePageClient when present', () => {
      mockGet.mockImplementation((key: string) => {
        const params: Record<string, string> = {
          userId: '0xUser',
          walletId: '0xWallet',
        };
        return params[key] ?? null;
      });

      render(<BundlePageEntry />);

      const calledProps = vi.mocked(BundlePageClient).mock.calls[0][0];
      expect(calledProps).toEqual(
        expect.objectContaining({ userId: '0xUser', walletId: '0xWallet' }),
      );
    });

    it('passes etlJobId to BundlePageClient when present', () => {
      mockGet.mockImplementation((key: string) => {
        const params: Record<string, string> = {
          userId: '0xUser',
          etlJobId: 'job-123',
        };
        return params[key] ?? null;
      });

      render(<BundlePageEntry />);

      const calledProps = vi.mocked(BundlePageClient).mock.calls[0][0];
      expect(calledProps).toEqual(
        expect.objectContaining({ userId: '0xUser', etlJobId: 'job-123' }),
      );
    });

    it("passes isNewUser=true when searchParam is 'true'", () => {
      mockGet.mockImplementation((key: string) => {
        const params: Record<string, string> = {
          userId: '0xUser',
          isNewUser: 'true',
        };
        return params[key] ?? null;
      });

      render(<BundlePageEntry />);

      const calledProps = vi.mocked(BundlePageClient).mock.calls[0][0];
      expect(calledProps).toEqual(
        expect.objectContaining({ userId: '0xUser', isNewUser: true }),
      );
    });

    it('does not pass walletId when null', () => {
      mockGet.mockImplementation((key: string) => {
        if (key === 'userId') return '0xUser';
        return null;
      });

      render(<BundlePageEntry />);

      const calledProps = vi.mocked(BundlePageClient).mock.calls[0][0];
      expect(calledProps).not.toHaveProperty('walletId');
    });

    it("does not pass isNewUser when param is not 'true'", () => {
      mockGet.mockImplementation((key: string) => {
        if (key === 'userId') return '0xUser';
        if (key === 'isNewUser') return 'false';
        return null;
      });

      render(<BundlePageEntry />);

      const calledProps = vi.mocked(BundlePageClient).mock.calls[0][0];
      expect(calledProps).not.toHaveProperty('isNewUser');
    });
  });
});
